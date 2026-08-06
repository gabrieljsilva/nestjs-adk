import {
	type DynamicModule,
	Global,
	Module,
	type OnApplicationShutdown,
	type OnModuleInit,
	type Provider,
} from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { IdGenerator } from "../../common/identity/id-generator";
import { Clock } from "../../common/time/clock";
import { ArtifactStorage } from "../../contracts/artifact-storage";
import { ModelResolver } from "../../contracts/model-resolver";
import type { SessionEventConsumer } from "../../contracts/session-event-consumer";
import { SessionStorage } from "../../contracts/session-storage";
import type { LlmModel } from "../../domain/model/llm-model";
import type { RuntimeOptionsPatch } from "../../runtime/composition/runtime-options";
import { CatalogModelResolver } from "../../runtime/model/catalog-model-resolver";
import { AdkRuntimeHost } from "../adk-runtime-host";
import { AdkComposer } from "./adk-composer";
import { AdkModuleOptions } from "./adk-module-options";
import { AgentRegistry } from "./agent-registry";
import { RandomIdGenerator } from "./random-id-generator";
import { SystemClock } from "./system-clock";

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
		private readonly composer: AdkComposer,
		private readonly host: AdkRuntimeHost,
	) {}

	public static forRoot(options: AdkModuleOptions): DynamicModule {
		return {
			module: AdkModule,
			imports: [DiscoveryModule],
			providers: [...AdkModule.providersFor(options)],
			exports: [AgentRegistry, AdkRuntimeHost, SessionStorage, ArtifactStorage, Clock, IdGenerator, ModelResolver],
		};
	}

	public async onModuleInit(): Promise<void> {
		await this.composer.compose(this.discovery.getProviders());
	}

	public async onApplicationShutdown(): Promise<void> {
		await this.host.stop();
	}

	/**
	 * Providers declare, they do not compose.
	 *
	 * Every factory here reads the options through `ADK_OPTIONS` rather than capturing them
	 * in a closure, so overriding one token is enough: the others keep following whatever
	 * the container says the options are.
	 */
	private static providersFor(options: AdkModuleOptions): Provider[] {
		return [
			{ provide: ADK_OPTIONS, useValue: options },
			{
				provide: ADK_DEFAULT_MODEL,
				useFactory: (declared: AdkModuleOptions) => declared.defaultModel,
				inject: [ADK_OPTIONS],
			},
			{ provide: ADK_EVENT_CONSUMERS, useValue: [] },
			{ provide: ADK_RUNTIME_PATCH, useValue: {} },
			{
				provide: SessionStorage,
				useFactory: (declared: AdkModuleOptions) => declared.storage ?? new InMemorySessionStorage(),
				inject: [ADK_OPTIONS],
			},
			{
				provide: Clock,
				useFactory: (declared: AdkModuleOptions) => declared.clock ?? new SystemClock(),
				inject: [ADK_OPTIONS],
			},
			{
				provide: IdGenerator,
				useFactory: (declared: AdkModuleOptions) => declared.ids ?? new RandomIdGenerator(),
				inject: [ADK_OPTIONS],
			},
			{
				provide: ArtifactStorage,
				useFactory: (declared: AdkModuleOptions, ids: IdGenerator) =>
					declared.artifacts ?? new InMemoryArtifactStorage(ids),
				inject: [ADK_OPTIONS, IdGenerator],
			},
			{
				provide: ModelResolver,
				useFactory: (declared: AdkModuleOptions) => declared.runtime?.models ?? new CatalogModelResolver(),
				inject: [ADK_OPTIONS],
			},
			AdkRuntimeHost,
			{
				provide: AgentRegistry,
				useFactory: (host: AdkRuntimeHost) => new AgentRegistry(host),
				inject: [AdkRuntimeHost],
			},
			{
				provide: AdkComposer,
				useFactory: (
					host: AdkRuntimeHost,
					registry: AgentRegistry,
					declared: AdkModuleOptions,
					storage: SessionStorage,
					artifacts: ArtifactStorage,
					clock: Clock,
					ids: IdGenerator,
					models: ModelResolver,
					consumers: readonly SessionEventConsumer[],
					defaultModel: LlmModel,
					patch: RuntimeOptionsPatch,
				) =>
					new AdkComposer(host, registry, declared, storage, artifacts, clock, ids, models, consumers, defaultModel, patch),
				inject: [
					AdkRuntimeHost,
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

/** Imported rather than declared: `DiscoveryService` comes from NestJS itself. */
const DiscoveryModule: DynamicModule = {
	module: class AdkDiscoveryModule {},
	providers: [DiscoveryService],
	exports: [DiscoveryService],
};
