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

/** The token an application injects to reach what the module built. */
export const ADK_OPTIONS = Symbol.for("adk:module-options");

/**
 * The model every agent that declared none runs on.
 *
 * Overriding this token replaces only that fallback: an agent that declared its own model
 * in `@Agent` keeps it. A test that wants one agent on another model replaces the
 * `ModelResolver` instead.
 */
export const ADK_DEFAULT_MODEL = Symbol.for("adk:default-model");

/**
 * Consumers appended to the ones the application declared, never replacing them.
 *
 * The module provides an empty list; overriding the token plugs observers in without
 * rebuilding `RuntimeOptions`, which is how a test records events while the approval
 * policy and limits the application declared stay in force.
 */
export const ADK_EVENT_CONSUMERS = Symbol.for("adk:event-consumers");

/**
 * Runtime fields replaced after the application declared them, by name.
 *
 * The module provides an empty patch, so nothing changes unless somebody overrides the
 * token. It exists because the options are a value the module was constructed with:
 * without it, replacing one runtime field from outside means rebuilding all of them, and
 * a field added later goes silently missing from every copy.
 *
 * The patch is nested the way `RuntimeOptions` is, and a group named partially keeps the
 * fields of that group it did not mention: `{ cost: { pricing } }` replaces the pricing
 * source and leaves the notice sink beside it alone.
 */
export const ADK_RUNTIME_PATCH = Symbol.for("adk:runtime-patch");

/**
 * The one thing an application imports.
 *
 * It owns the runtime for the lifetime of the application: it discovers the agents,
 * composes the runtime once everything NestJS builds exists, and drains it on shutdown.
 * Everything it exposes is already resolved, so no consumer ever waits on a boot order.
 *
 * Composition happens in `onModuleInit` and not in a provider, and that is the whole of
 * the boot order. NestJS creates a prototype for every provider first and only then
 * constructs them, all modules at once, replacing what the prototype step left behind. A
 * provider that composed while that was happening would capture objects the container is
 * about to throw away: tools without their dependencies, agents that never receive a
 * handle. By the first lifecycle hook every static instance exists and is final, and an
 * imported module reaches its hook before the module that imported it, so an application
 * can already use an agent inside its own `onModuleInit`.
 */
@Global()
@Module({})
export class AdkModule implements OnModuleInit, OnApplicationShutdown {
	public constructor(
		private readonly discovery: DiscoveryService,
		private readonly composer: ComposeRuntimeUseCase,
		private readonly host: AdkRuntime,
	) {}

	/**
	 * The module, configured where it is imported.
	 *
	 * The literal is the form to write: `AdkModule.forRoot({ defaultModel })` is a working
	 * runtime, and every port left out composes to the same default `createAdkRuntime` picks.
	 * An `AdkModuleOptions` built elsewhere is accepted unchanged, because an application that
	 * shares one object between its module and its tests already holds the class.
	 */
	public static forRoot(options: AdkModuleOptions | AdkModuleOptionsInput): DynamicModule {
		return AdkModule.moduleWith([{ provide: ADK_OPTIONS, useValue: AdkModule.resolveOptions(options) }]);
	}

	/**
	 * The same module, with its options built inside the container.
	 *
	 * An application whose ports are providers cannot name them in a value: a storage that
	 * depends on a database client, an embedder that needs credentials and an approval policy
	 * that reads the current tenant only exist once NestJS has built them. This is the entry
	 * point for that, and it changes nothing else: every provider already reads the options
	 * through `ADK_OPTIONS`, so composing them later composes the whole runtime later.
	 *
	 * ```ts
	 * AdkModule.forRootAsync({ imports: [InfraModule], useClass: AdkOptions });
	 * ```
	 *
	 * Prefer `useClass`. A factory's dependencies are an `inject` array TypeScript cannot
	 * check against its parameters, and a class declares them in its constructor.
	 *
	 * Whatever the factory depends on has to be reachable through `imports`, and it may not
	 * be one of the tokens this module itself provides: asking for `SessionStorage` to build
	 * the options that decide what `SessionStorage` is, is a cycle NestJS will refuse.
	 */
	public static forRootAsync(options: AdkModuleAsyncOptions): DynamicModule {
		return AdkModule.moduleWith(AdkModule.buildOptionsProviders(options), options.imports);
	}

	/** A literal is options that have not been built yet, and both entry points accept one. */
	private static resolveOptions(declared: AdkModuleOptions | AdkModuleOptionsInput): AdkModuleOptions {
		return declared instanceof AdkModuleOptions ? declared : AdkModuleOptions.from(declared);
	}

	/** One shape for both entry points, so the two can never drift on what the module exports. */
	private static moduleWith(options: Provider[], imports: ModuleMetadata["imports"] = []): DynamicModule {
		return {
			module: AdkModule,
			imports: [DiscoveryModule, ...imports],
			providers: [...options, ...AdkModule.buildProviders()],
			exports: [AgentRegistry, AdkRuntime, SessionStorage, ArtifactStorage, Clock, IdGenerator, ModelResolver, Embedder],
		};
	}

	/**
	 * Whichever of the three forms was declared, as the provider behind `ADK_OPTIONS`.
	 *
	 * Both refusals happen here, which is while `app.module.ts` is being read rather than
	 * during the boot it would otherwise poison. `useClass` is registered as a provider of
	 * this module, which is what lets an application name a class it declared nowhere.
	 */
	private static buildOptionsProviders(declared: AdkModuleAsyncOptions): Provider[] {
		const forms = AdkModule.declaredForms(declared);
		const [only] = forms;
		if (only === undefined) throw new AsyncOptionsNotDeclaredError();
		if (forms.length > 1) throw new ConflictingAsyncOptionsError(forms.map((form) => form.name));
		return only.providers;
	}

	/** Every form the caller declared, named and already turned into providers. Exactly one is legal. */
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

	/**
	 * Providers declare, they do not compose.
	 *
	 * Every factory here reads the options through `ADK_OPTIONS` rather than capturing them
	 * in a closure, so overriding one token is enough: the others keep following whatever
	 * the container says the options are. It is also what makes `forRootAsync` a change to
	 * one provider rather than to the module, since none of these know when the options
	 * arrived, only that the token answers.
	 */
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

/** One way of naming where the options come from, already resolved into what it provides. */
interface DeclaredForm {
	readonly name: string;
	readonly providers: Provider[];
}

/** Imported rather than declared: `DiscoveryService` comes from NestJS itself. */
const DiscoveryModule: DynamicModule = {
	module: class AdkDiscoveryModule {},
	providers: [DiscoveryService],
	exports: [DiscoveryService],
};
