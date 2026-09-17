import type { IdGenerator } from "../common/identity/id-generator.contract";
import type { Clock } from "../common/time/clock.contract";
import type { ArtifactStorage } from "../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../contracts/storage/session-storage.contract";
import type { AgentDefinition } from "../domain/agent/agent-definition.value-object";
import type { DeclaredAgent } from "../domain/agent/declared-agent.value-object";
import type { ToolDefinition } from "../domain/tool/tool-definition.value-object";
import { RuntimeOptions, type RuntimeOptionsPatch } from "../runtime/composition/runtime.options";
import { AdkRuntime } from "./adk-runtime.edge";
import { StartedAdkRuntime } from "./started-adk-runtime.edge";

/** What a runtime is composed from when nobody declares a module, named rather than ordered. */
export interface AdkRuntimeInput {
	/** The agents this runtime answers for, as definitions written by hand or as scanned declarations. */
	agents: readonly (AgentDefinition | DeclaredAgent)[];
	/** Absent means conversations in memory, which is the same default `AdkModule` registers. */
	storage?: SessionStorage;
	artifacts?: ArtifactStorage;
	clock?: Clock;
	ids?: IdGenerator;
	/** The runtime's own knobs, as a patch: naming one field of a group keeps the fields beside it. */
	runtime?: RuntimeOptionsPatch;
	/** Tools published to the outside, for an application that serves its own over MCP. */
	exposed?: readonly ToolDefinition[];
}

/**
 * A working runtime from one call, for an application with no NestJS container.
 *
 * ```ts
 * const adk = await createAdkRuntime({ agents: [support] });
 * const answer = await adk.findAgent("support").ask("where is order 42?");
 * await adk.stop();
 * ```
 *
 * What it composes is what `AdkModule` composes: the same `AdkRuntime`, the same
 * `RuntimeDefaults` behind everything left out, and the same `AgentHandle` answering the
 * questions. The container is the only difference, which is the point: the decorators
 * discover agents that NestJS built, and here the caller holds the definitions already.
 */
export async function createAdkRuntime(input: AdkRuntimeInput): Promise<StartedAdkRuntime> {
	const host = new AdkRuntime();
	await host.start({
		agents: input.agents,
		storage: input.storage,
		artifacts: input.artifacts,
		clock: input.clock,
		ids: input.ids,
		options: RuntimeOptions.from(input.runtime ?? {}),
		exposed: input.exposed,
	});
	return new StartedAdkRuntime(host);
}
