import type { Type } from "@nestjs/common";
import type { AgentRunner } from "../runner/agent-runner";
import type { AgentEvent, RunInput, RunResult } from "../types/events";
import type { AgentDefinition } from "./agent-definition";
import type { AgentRegistry } from "./agent-registry";

/**
 * Typed handle for an agent, obtained via AgentRegistry.getRef (registry/testing API).
 * App code injects the agent class directly — the instance itself is the handle.
 */
export class AgentRef<TAgent = unknown> {
	/** Type marker — never assigned at runtime. */
	declare readonly __adkAgent?: TAgent;

	public constructor(
		private readonly registry: AgentRegistry,
		private readonly agentType: Type,
		private readonly getRunner: () => AgentRunner,
	) {}

	public get name(): string {
		return this.definition.name;
	}

	public get definition(): AgentDefinition {
		return this.registry.getByType(this.agentType);
	}

	/** Aggregates final text + usage + trace; AiEmptyResponseError on an empty response. */
	public ask(input: RunInput): Promise<RunResult> {
		return this.getRunner().ask(this.agentType, input);
	}

	/** Normalized event loop (streaming). */
	public stream(input: RunInput): AsyncGenerator<AgentEvent> {
		return this.getRunner().run(this.agentType, input);
	}

	/** HITL: approves a pending action — executes the tool and resumes the agent. */
	public approve(params: { sessionId: string; callId: string; message?: string }): Promise<RunResult> {
		return this.getRunner().approve(this.agentType, params);
	}

	/** HITL: rejects a pending action — does NOT execute it and informs the agent. */
	public reject(params: { sessionId: string; callId: string; reason?: string }): Promise<RunResult> {
		return this.getRunner().reject(this.agentType, params);
	}
}
