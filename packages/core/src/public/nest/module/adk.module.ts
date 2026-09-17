import {
	type DynamicModule,
	Global,
	Module,
	type ModuleMetadata,
	type OnApplicationShutdown,
	type OnModuleInit,
	type Provider,
	type Type,
} from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import { IdGenerator } from "../../../common/identity/id-generator.contract";
import { Clock } from "../../../common/time/clock.contract";
import type { SessionEventConsumer } from "../../../contracts/events/session-event-consumer.contract";
import { Embedder } from "../../../contracts/model/embedder.contract";
import { ModelResolver } from "../../../contracts/model/model-resolver.contract";
import { ArtifactStorage } from "../../../contracts/storage/artifact-storage.contract";
import { SessionStorage } from "../../../contracts/storage/session-storage.contract";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import type { RuntimeOptionsPatch } from "../../../runtime/composition/runtime.options";
import { CatalogModelResolver } from "../../../runtime/model/catalog-model-resolver.adapter";
import { AdkRuntime } from "../../adk-runtime.edge";
import { RuntimeDefaults } from "../../runtime-defaults.factory";
import { AgentRegistry } from "../agent/agent-registry.service";
import { AsyncOptionsNotDeclaredError } from "../errors/async-options-not-declared.error";
import { ConflictingAsyncOptionsError } from "../errors/conflicting-async-options.error";
import { UndeclaredEmbedder } from "../undeclared-embedder.adapter";
import type { AdkModuleAsyncOptions, AdkOptionsFactory } from "./adk-module-async.options";
import { AdkModuleOptions, type AdkModuleOptionsInput } from "./adk-module.options";
import { ComposeRuntimeUseCase } from "./compose-runtime.use-case";

/** The token an application injects to reach the options the module was declared with. */
export const ADK_OPTIONS = Symbol.for("adk:module-options");

/**
 * The model every agent that declared none runs on. Overriding this token replaces only that
 * fallback; a test that wants one agent on another model replaces the `ModelResolver` instead.
 */
export const ADK_DEFAULT_MODEL = Symbol.for("adk:default-model");

/**
 * Consumers appended to the ones the application declared, never replacing them. Overriding it
 * plugs observers in without rebuilding `RuntimeOptions`, so the declared approval policy and
 * limits stay in force.
 */
export const ADK_EVENT_CONSUMERS = Symbol.for("adk:event-consumers");

/**
 * Runtime fields replaced after the application declared them, by name. The module provides an
 * empty patch, and it is nested the way `RuntimeOptions` is: `{ cost: { pricing } }` leaves the
 * notice sink beside it alone.
 */
export const ADK_RUNTIME_PATCH = Symbol.for("adk:runtime-patch");

@Global()
@Module({})
/**
 * The one thing an application imports. It discovers the agents, composes the runtime once
 * everything NestJS builds exists, and drains it on shutdown, so nothing it exposes ever waits
 * on a boot order.
 *
 * `forRoot` takes the options as a literal; `forRootAsync` builds the same object inside the
 * container, for a port that is itself a provider.
 */
export class AdkModule implements OnModuleInit, OnApplicationShutdown {
	public constructor(
		private readonly discovery: DiscoveryService,
		private readonly composer: ComposeRuntimeUseCase,
		private readonly host: AdkRuntime,
	) {}

	public static forRoot(options: AdkModuleOptions | AdkModuleOptionsInput): DynamicModule {
		return AdkModule.moduleWith([{ provide: ADK_OPTIONS, useValue: AdkModule.resolveOptions(options) }]);
	}

	public static forRootAsync(options: AdkModuleAsyncOptions): DynamicModule {
		return AdkModule.moduleWith(AdkModule.buildOptionsProviders(options), options.imports);
	}

	private static resolveOptions(declared: AdkModuleOptions | AdkModuleOptionsInput): AdkModuleOptions {
		return declared instanceof AdkModuleOptions ? declared : AdkModuleOptions.from(declared);
	}

	private static moduleWith(options: Provider[], imports: ModuleMetadata["imports"] = []): DynamicModule {
		return {
			module: AdkModule,
			imports: [DiscoveryModule, ...imports],
			providers: [...options, ...AdkModule.buildProviders()],
			exports: [AgentRegistry, AdkRuntime, SessionStorage, ArtifactStorage, Clock, IdGenerator, ModelResolver, Embedder],
		};
	}

	private static buildOptionsProviders(declared: AdkModuleAsyncOptions): Provider[] {
		const forms = AdkModule.declaredForms(declared);
		const [only] = forms;
		if (only === undefined) throw new AsyncOptionsNotDeclaredError();
		if (forms.length > 1) throw new ConflictingAsyncOptionsError(forms.map((form) => form.name));
		return only.providers;
	}

	private static declaredForms(declared: AdkModuleAsyncOptions): readonly DeclaredForm[] {
		const forms: DeclaredForm[] = [];
		const factory = declared.useFactory;
		if (factory !== undefined) {
			const inject = [...(declared.inject ?? [])];
			forms.push({
				name: "useFactory",
				providers: [
					{
						provide: ADK_OPTIONS,
						useFactory: async (...args: never[]) => AdkModule.resolveOptions(await factory(...args)),
						inject,
					},
				],
			});
		}
		if (declared.useClass !== undefined) {
			forms.push({ name: "useClass", providers: [declared.useClass, AdkModule.optionsBuiltBy(declared.useClass)] });
		}
		if (declared.useExisting !== undefined) {
			forms.push({ name: "useExisting", providers: [AdkModule.optionsBuiltBy(declared.useExisting)] });
		}
		return forms;
	}

	private static optionsBuiltBy(factory: Type<AdkOptionsFactory>): Provider {
		return {
			provide: ADK_OPTIONS,
			useFactory: async (source: AdkOptionsFactory) => AdkModule.resolveOptions(await source.createAdkOptions()),
			inject: [factory],
		};
	}

	public async onModuleInit(): Promise<void> {
		await this.composer.execute(this.discovery.getProviders());
	}

	public async onApplicationShutdown(): Promise<void> {
		await this.host.stop();
	}

	private static buildProviders(): Provider[] {
		return [
			{
				provide: ADK_DEFAULT_MODEL,
				useFactory: (declared: AdkModuleOptions) => declared.defaultModel,
				inject: [ADK_OPTIONS],
			},
			{ provide: ADK_EVENT_CONSUMERS, useValue: [] },
			{ provide: ADK_RUNTIME_PATCH, useValue: {} },
			{
				provide: SessionStorage,
				useFactory: (declared: AdkModuleOptions) => declared.storage ?? RuntimeDefaults.buildSessionStorage(),
				inject: [ADK_OPTIONS],
			},
			{
				provide: Clock,
				useFactory: (declared: AdkModuleOptions) => declared.clock ?? RuntimeDefaults.buildClock(),
				inject: [ADK_OPTIONS],
			},
			{
				provide: IdGenerator,
				useFactory: (declared: AdkModuleOptions) => declared.ids ?? RuntimeDefaults.buildIdGenerator(),
				inject: [ADK_OPTIONS],
			},
			{
				provide: ArtifactStorage,
				useFactory: (declared: AdkModuleOptions, ids: IdGenerator) =>
					declared.artifacts ?? RuntimeDefaults.buildArtifactStorage(ids),
				inject: [ADK_OPTIONS, IdGenerator],
			},
			{
				provide: Embedder,
				useFactory: (declared: AdkModuleOptions) => declared.embedder ?? new UndeclaredEmbedder(),
				inject: [ADK_OPTIONS],
			},
			{
				provide: ModelResolver,
				useFactory: (declared: AdkModuleOptions) => declared.runtime?.model.resolver ?? new CatalogModelResolver(),
				inject: [ADK_OPTIONS],
			},
			AdkRuntime,
			{
				provide: AgentRegistry,
				useFactory: (host: AdkRuntime) => new AgentRegistry(host),
				inject: [AdkRuntime],
			},
			{
				provide: ComposeRuntimeUseCase,
				useFactory: (
					host: AdkRuntime,
					registry: AgentRegistry,
					declared: AdkModuleOptions,
					storage: SessionStorage,
					artifacts: ArtifactStorage,
					clock: Clock,
					ids: IdGenerator,
					models: ModelResolver,
					consumers: readonly SessionEventConsumer[],
					defaultModel: LlmModel | undefined,
					patch: RuntimeOptionsPatch,
				) =>
					new ComposeRuntimeUseCase(
						host,
						registry,
						declared,
						storage,
						artifacts,
						clock,
						ids,
						models,
						consumers,
						defaultModel,
						patch,
					),
				inject: [
					AdkRuntime,
					AgentRegistry,
					ADK_OPTIONS,
					SessionStorage,
					ArtifactStorage,
					Clock,
					IdGenerator,
					ModelResolver,
					ADK_EVENT_CONSUMERS,
					ADK_DEFAULT_MODEL,
					ADK_RUNTIME_PATCH,
				],
			},
		];
	}
}

interface DeclaredForm {
	readonly name: string;
	readonly providers: Provider[];
}

const DiscoveryModule: DynamicModule = {
	module: class AdkDiscoveryModule {},
	providers: [DiscoveryService],
	exports: [DiscoveryService],
};
