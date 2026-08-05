import { type DynamicModule, Global, Inject, Module, type OnApplicationShutdown, type Provider } from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import { NestAgentScanner } from "../../adapters/nest/nest-agent-scanner";
import { NestComponentDiscovery } from "../../adapters/nest/nest-component-discovery";
import { ScannedProvider } from "../../adapters/nest/scanned-provider";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { IdGenerator } from "../../common/identity/id-generator";
import { Clock } from "../../common/time/clock";
import { ArtifactStorage } from "../../contracts/artifact-storage";
import { SessionStorage } from "../../contracts/session-storage";
import { RuntimeOptions } from "../../runtime/composition/runtime-options";
import { RuntimeServices } from "../../runtime/composition/runtime-services";
import { AdkRuntimeHost } from "../adk-runtime-host";
import { AdkModuleOptions } from "./adk-module-options";
import { AgentRegistry } from "./agent-registry";
import { RandomIdGenerator } from "./random-id-generator";
import { SystemClock } from "./system-clock";

/** The token an application injects to reach what the module built. */
export const ADK_OPTIONS = Symbol.for("adk:module-options");

/**
 * The one thing an application imports.
 *
 * It owns the runtime for the lifetime of the application: it discovers the agents,
 * composes the runtime once everything NestJS builds exists, and drains it on shutdown.
 * Everything it exposes is already resolved, so no consumer ever waits on a boot order.
 *
 * Discovery happens after the container is ready rather than at import time. An agent's
 * tools are providers with their own dependencies, and reading them earlier would mean
 * reading half-built objects.
 */
@Global()
@Module({})
export class AdkModule implements OnApplicationShutdown {
	public constructor(
		@Inject(ADK_OPTIONS) private readonly options: AdkModuleOptions,
		private readonly discovery: DiscoveryService,
		private readonly host: AdkRuntimeHost,
	) {}

	public static forRoot(options: AdkModuleOptions): DynamicModule {
		return {
			module: AdkModule,
			imports: [DiscoveryModule],
			providers: [...AdkModule.providersFor(options)],
			exports: [RuntimeServices, AgentRegistry, AdkRuntimeHost, SessionStorage, ArtifactStorage, Clock, IdGenerator],
		};
	}

	public async onApplicationShutdown(): Promise<void> {
		await this.host.stop();
	}

	private static providersFor(options: AdkModuleOptions): Provider[] {
		return [
			{ provide: ADK_OPTIONS, useValue: options },
			{ provide: SessionStorage, useValue: options.storage ?? new InMemorySessionStorage() },
			{ provide: Clock, useValue: options.clock ?? new SystemClock() },
			{ provide: IdGenerator, useValue: options.ids ?? new RandomIdGenerator() },
			{
				provide: ArtifactStorage,
				useFactory: (ids: IdGenerator) => options.artifacts ?? new InMemoryArtifactStorage(ids),
				inject: [IdGenerator],
			},
			AdkRuntimeHost,
			{
				provide: RuntimeServices,
				useFactory: AdkModule.startRuntime,
				inject: [AdkRuntimeHost, DiscoveryService, ADK_OPTIONS, SessionStorage, ArtifactStorage, Clock, IdGenerator],
			},
			{
				provide: AgentRegistry,
				useFactory: (runtime: RuntimeServices) => new AgentRegistry(runtime),
				inject: [RuntimeServices],
			},
		];
	}

	/** Composes the runtime from what the container finished building. */
	private static async startRuntime(
		host: AdkRuntimeHost,
		discovery: DiscoveryService,
		options: AdkModuleOptions,
		storage: SessionStorage,
		artifacts: ArtifactStorage,
		clock: Clock,
		ids: IdGenerator,
	): Promise<RuntimeServices> {
		const scanned = discovery
			.getProviders()
			.filter((wrapper) => typeof wrapper.metatype === "function" && wrapper.instance !== undefined)
			.map((wrapper) => new ScannedProvider(String(wrapper.name), Object(wrapper.metatype), Object(wrapper.instance)));

		const declared = new NestComponentDiscovery().discover(new NestAgentScanner().scan(scanned, options.defaultModel));
		return host.start(declared, storage, artifacts, clock, ids, options.runtime ?? new RuntimeOptions());
	}
}

/** Imported rather than declared: `DiscoveryService` comes from NestJS itself. */
const DiscoveryModule: DynamicModule = {
	module: class AdkDiscoveryModule {},
	providers: [DiscoveryService],
	exports: [DiscoveryService],
};
