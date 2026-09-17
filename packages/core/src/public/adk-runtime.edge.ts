import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage.adapter";
import type { IdGenerator } from "../common/identity/id-generator.contract";
import type { Clock } from "../common/time/clock.contract";
import type { ArtifactStorage } from "../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../contracts/storage/session-storage.contract";
import { AgentDefinition } from "../domain/agent/agent-definition.value-object";
import { DeclaredAgent } from "../domain/agent/declared-agent.value-object";
import { ArtifactsNotDurable } from "../domain/artifact/artifacts-not-durable.notice";
import type { ToolDefinition } from "../domain/tool/tool-definition.value-object";
import { AgentCatalogBuilder } from "../runtime/catalog/agent-catalog-builder.factory";
import type { RuntimeServices } from "../runtime/composition/runtime-services.value-object";
import { RuntimeFactory } from "../runtime/composition/runtime.factory";
import { RuntimeOptions } from "../runtime/composition/runtime.options";
import { HostNotStartedError } from "./errors/host-not-started.error";
import { RuntimeDefaults } from "./runtime-defaults.factory";

/** Where a composed runtime is read from, for anything built before the runtime exists. */
export interface StartedRuntime {
	readonly runtime: RuntimeServices;
}

/** What a runtime was composed against, after the defaults filled in whatever nobody named. */
export interface RuntimeComponents {
	readonly storage: SessionStorage;
	readonly artifacts: ArtifactStorage;
	readonly clock: Clock;
	readonly ids: IdGenerator;
}

/** What starting a runtime takes, named rather than ordered, and all of it optional but the agents. */
export interface AdkRuntimeStartInput {
	agents: readonly (AgentDefinition | DeclaredAgent)[];
	storage?: SessionStorage;
	artifacts?: ArtifactStorage;
	clock?: Clock;
	ids?: IdGenerator;
	options?: RuntimeOptions;
	exposed?: readonly ToolDefinition[];
}

/**
 * The runtime, started and stopped by whoever owns the process: `AdkModule` under NestJS,
 * `createAdkRuntime` without it. Both compose the same runtime, filling anything absent from
 * `RuntimeDefaults`.
 *
 * Reading `runtime` or `composed` before `start` raises `HostNotStartedError`. `stop` drains
 * active runs, flushes what was observed and disposes, and is safe to call twice.
 */
export class AdkRuntime implements StartedRuntime {
	private services?: RuntimeServices;
	private components?: RuntimeComponents;

	public constructor(private readonly factory: RuntimeFactory = new RuntimeFactory()) {}

	public async start(input: AdkRuntimeStartInput): Promise<RuntimeServices> {
		const builder = new AgentCatalogBuilder();
		for (const agent of input.agents) builder.add(AdkRuntime.resolveAgent(agent));

		const components = AdkRuntime.resolveComponents(input);
		const options = input.options ?? new RuntimeOptions();
		AdkRuntime.reportEphemeralArtifacts(components.artifacts, options);
		this.components = components;
		this.services = await this.factory.create(
			builder.build(),
			components.storage,
			components.artifacts,
			components.clock,
			components.ids,
			options,
			input.exposed ?? [],
		);
		return this.services;
	}

	public get runtime(): RuntimeServices {
		if (this.services === undefined) throw new HostNotStartedError();
		return this.services;
	}

	public get composed(): RuntimeComponents {
		if (this.components === undefined) throw new HostNotStartedError();
		return this.components;
	}

	public get isStarted(): boolean {
		return this.services !== undefined;
	}

	public async stop(): Promise<void> {
		await this.services?.lifecycle.drain();
		await this.services?.events.flush();
		await this.factory.dispose();
	}

	private static reportEphemeralArtifacts(artifacts: ArtifactStorage, options: RuntimeOptions): void {
		if (!options.context.offload.isEnabled || !(artifacts instanceof InMemoryArtifactStorage)) return;
		options.context.contextNotices?.report(
			undefined,
			new ArtifactsNotDurable(artifacts.constructor.name, options.context.offload.thresholdCharacters),
		);
	}

	private static resolveAgent(agent: AgentDefinition | DeclaredAgent): DeclaredAgent {
		return agent instanceof AgentDefinition ? new DeclaredAgent(agent, agent.name.value) : agent;
	}

	private static resolveComponents(input: AdkRuntimeStartInput): RuntimeComponents {
		const ids = input.ids ?? RuntimeDefaults.buildIdGenerator();
		return {
			storage: input.storage ?? RuntimeDefaults.buildSessionStorage(),
			artifacts: input.artifacts ?? RuntimeDefaults.buildArtifactStorage(ids),
			clock: input.clock ?? RuntimeDefaults.buildClock(),
			ids: ids,
		};
	}
}
