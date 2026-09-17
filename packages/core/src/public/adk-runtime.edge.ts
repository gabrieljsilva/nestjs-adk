import type { IdGenerator } from "../common/identity/id-generator.contract";
import type { Clock } from "../common/time/clock.contract";
import type { ArtifactStorage } from "../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../contracts/storage/session-storage.contract";
import { AgentDefinition } from "../domain/agent/agent-definition.value-object";
import { DeclaredAgent } from "../domain/agent/declared-agent.value-object";
import type { ToolDefinition } from "../domain/tool/tool-definition.value-object";
import { AgentCatalogBuilder } from "../runtime/catalog/agent-catalog-builder.factory";
import type { RuntimeServices } from "../runtime/composition/runtime-services.value-object";
import { RuntimeFactory } from "../runtime/composition/runtime.factory";
import { RuntimeOptions } from "../runtime/composition/runtime.options";
import { HostNotStartedError } from "./errors/host-not-started.error";
import { RuntimeDefaults } from "./runtime-defaults.factory";

/**
 * Where a composed runtime is read from, whenever it exists.
 *
 * Anything built while the container is still being wired holds this rather than the
 * services themselves: the runtime is composed on module init, so a collaborator created
 * before that has to ask later instead of being handed something that does not exist yet.
 */
export interface StartedRuntime {
	readonly runtime: RuntimeServices;
}

/**
 * What a runtime was composed against, after the defaults filled in what nobody named.
 *
 * It is answered rather than assumed because the caller may have named none of it: an
 * application that let the library pick its storage still has to be able to reach the one
 * it picked.
 */
export interface RuntimeComponents {
	readonly storage: SessionStorage;
	readonly artifacts: ArtifactStorage;
	readonly clock: Clock;
	readonly ids: IdGenerator;
}

/** What starting a runtime takes, named rather than ordered, and all of it optional but the agents. */
export interface AdkRuntimeStartInput {
	/**
	 * The agents this runtime answers for.
	 *
	 * A definition is accepted directly, which is what an application without NestJS holds;
	 * `DeclaredAgent` is what the scanner builds, and it carries the name of the class that
	 * declared it so a duplicate reports both sides by the names somebody wrote.
	 */
	agents: readonly (AgentDefinition | DeclaredAgent)[];
	/** Absent means `RuntimeDefaults`, which is conversations in memory. */
	storage?: SessionStorage;
	artifacts?: ArtifactStorage;
	clock?: Clock;
	ids?: IdGenerator;
	options?: RuntimeOptions;
	/** Tools published to the outside rather than offered to a model. */
	exposed?: readonly ToolDefinition[];
}

/**
 * The runtime, started and stopped by whoever owns the process.
 *
 * Under NestJS that is `AdkModule`, which starts it in a lifecycle hook and drains it on
 * shutdown. Without NestJS it is `createAdkRuntime`, and the two compose the same runtime
 * from the same defaults: everything absent from the input is filled in from
 * `RuntimeDefaults` here, so neither entry point owns a table of its own.
 *
 * Stopping drains active runs before disposing, and is safe to call twice because both the
 * drain and the disposal are idempotent.
 */
export class AdkRuntime implements StartedRuntime {
	private services?: RuntimeServices;
	private components?: RuntimeComponents;

	public constructor(private readonly factory: RuntimeFactory = new RuntimeFactory()) {}

	public async start(input: AdkRuntimeStartInput): Promise<RuntimeServices> {
		const builder = new AgentCatalogBuilder();
		for (const agent of input.agents) builder.add(AdkRuntime.resolveAgent(agent));

		const components = AdkRuntime.resolveComponents(input);
		this.components = components;
		this.services = await this.factory.create(
			builder.build(),
			components.storage,
			components.artifacts,
			components.clock,
			components.ids,
			input.options ?? new RuntimeOptions(),
			input.exposed ?? [],
		);
		return this.services;
	}

	public get runtime(): RuntimeServices {
		if (this.services === undefined) throw new HostNotStartedError();
		return this.services;
	}

	/** What this runtime was composed against, including whatever the defaults supplied. */
	public get composed(): RuntimeComponents {
		if (this.components === undefined) throw new HostNotStartedError();
		return this.components;
	}

	public get isStarted(): boolean {
		return this.services !== undefined;
	}

	/** Drain, then flush, then dispose: buffered observation leaves while the runtime still exists. */
	public async stop(): Promise<void> {
		await this.services?.lifecycle.drain();
		await this.services?.events.flush();
		await this.factory.dispose();
	}

	/** An agent written by hand declares itself, so the name of the definition is the name of the declarer. */
	private static resolveAgent(agent: AgentDefinition | DeclaredAgent): DeclaredAgent {
		return agent instanceof AgentDefinition ? new DeclaredAgent(agent, agent.name.value) : agent;
	}

	/** The one place the defaults are applied, so `AdkModule` and `createAdkRuntime` pick the same ones. */
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
