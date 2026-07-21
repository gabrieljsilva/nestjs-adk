import { type DynamicModule, Module, type Provider, type Type } from "@nestjs/common";
import { DiscoveryModule, ModuleRef } from "@nestjs/core";
import { AdkEngine } from "../abstracts/adk-engine";
import { ArtifactStore } from "../abstracts/artifact-store";
import { Embedder } from "../abstracts/embedder";
import { SessionStore } from "../abstracts/session-store";
import { ADK_OPTIONS, ADK_RUNNER } from "../constants";
import { Similarity } from "../embeddings/similarity";
import { AgentRegistry } from "../registry/agent-registry";
import { AgentRunner } from "../runner/agent-runner";
import { AgentSessions } from "../sessions/agent-sessions";
import { InMemoryArtifactStore } from "../stores/in-memory-artifact-store";
import { InMemorySessionStore } from "../stores/in-memory-session-store";
import type { AdkModuleAsyncOptions, AdkModuleOptions } from "./adk-options";

/** Prefers an instance already registered as a provider; otherwise instantiates via DI (global deps). */
async function resolveStore<T>(moduleRef: ModuleRef, cls: Type<T>): Promise<T> {
	try {
		return moduleRef.get(cls, { strict: false });
	} catch {
		return moduleRef.create(cls);
	}
}

@Module({})
export class AdkModule {
	public static forRoot(options: AdkModuleOptions): DynamicModule {
		return AdkModule.assemble(options.engine, [{ provide: ADK_OPTIONS, useValue: options }]);
	}

	public static forRootAsync(options: AdkModuleAsyncOptions): DynamicModule {
		const optionsProvider: Provider = {
			provide: ADK_OPTIONS,
			useFactory: async (...args: never[]) => ({ ...(await options.useFactory(...args)), engine: options.engine }),
			inject: options.inject ?? [],
		};
		return AdkModule.assemble(options.engine, [optionsProvider], options.imports);
	}

	private static assemble(
		engine: AdkModuleOptions["engine"],
		optionsProviders: Provider[],
		imports: DynamicModule["imports"] = [],
	): DynamicModule {
		const storeProviders: Provider[] = [
			{
				provide: SessionStore,
				useFactory: (options: AdkModuleOptions, moduleRef: ModuleRef) =>
					resolveStore(moduleRef, options.session ?? InMemorySessionStore),
				inject: [ADK_OPTIONS, ModuleRef],
			},
			{
				provide: ArtifactStore,
				useFactory: (options: AdkModuleOptions, moduleRef: ModuleRef) =>
					resolveStore(moduleRef, options.artifacts ?? InMemoryArtifactStore),
				inject: [ADK_OPTIONS, ModuleRef],
			},
			{
				// No default implementation — undefined when unset (inject with @Optional in production).
				provide: Embedder,
				useFactory: async (options: AdkModuleOptions, moduleRef: ModuleRef) => {
					const instance = options.embedder ? await resolveStore(moduleRef, options.embedder) : undefined;
					Embedder.setActive(instance);
					return instance;
				},
				inject: [ADK_OPTIONS, ModuleRef],
			},
		];

		return {
			module: AdkModule,
			global: true,
			imports: [DiscoveryModule, ...(imports ?? [])],
			providers: [
				...optionsProviders,
				{ provide: AdkEngine, useClass: engine },
				...storeProviders,
				Similarity,
				AgentRegistry,
				AgentRunner,
				{ provide: ADK_RUNNER, useExisting: AgentRunner },
				AgentSessions,
			],
			exports: [
				ADK_OPTIONS,
				AdkEngine,
				SessionStore,
				ArtifactStore,
				Embedder,
				Similarity,
				AgentRegistry,
				AgentRunner,
				ADK_RUNNER,
				AgentSessions,
			],
		};
	}
}

export type { AdkModuleAsyncOptions, AdkModuleOptions } from "./adk-options";
