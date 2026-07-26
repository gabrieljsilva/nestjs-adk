import { type DynamicModule, Logger, Module, type Provider, type Type } from "@nestjs/common";
import { DiscoveryModule, ModuleRef } from "@nestjs/core";
import { AdkEmbedder } from "../abstracts/adk-embedder";
import { AdkEngine } from "../abstracts/adk-engine";
import { ArtifactStore } from "../abstracts/artifact-store";
import { PricingSource } from "../abstracts/pricing-source";
import { SessionStore } from "../abstracts/session-store";
import { ADK_OPTIONS, ADK_RUNNER } from "../constants";
import { ContextCollector } from "../diagnostics/context-collector";
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
				provide: AdkEmbedder,
				useFactory: async (options: AdkModuleOptions, moduleRef: ModuleRef) => {
					const instance = options.embedder ? await resolveStore(moduleRef, options.embedder) : undefined;
					AdkEmbedder.setActive(instance);
					return instance;
				},
				inject: [ADK_OPTIONS, ModuleRef],
			},
			{
				// Loading is never awaited: a slow or unreachable catalog must not delay boot.
				provide: PricingSource,
				useFactory: (options: AdkModuleOptions) => {
					const source = options.pricing;
					PricingSource.setActive(source);
					source?.start().catch((error: unknown) => {
						// pricing stays off for the whole process — silence here would show up only as missing cost
						new Logger("Adk:pricing").error(`source failed to start: ${String(error)}`);
					});
					return source;
				},
				inject: [ADK_OPTIONS],
			},
			{
				// Opt-in: without `diagnostics` nothing is captured and the runner keeps an undefined collector.
				provide: ContextCollector,
				useFactory: (options: AdkModuleOptions) => {
					const collector = options.diagnostics ? new ContextCollector() : undefined;
					if (collector) {
						// visible on purpose: every model call is retained in memory for as long as the RunResult lives
						new Logger("Adk:diagnostics").log("context capture is ON — intended for tests, not production");
					}
					ContextCollector.setActive(collector);
					return collector;
				},
				inject: [ADK_OPTIONS],
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
				ContextCollector,
				SessionStore,
				ArtifactStore,
				AdkEmbedder,
				PricingSource,
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
