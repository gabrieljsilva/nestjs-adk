import type { Type } from "@nestjs/common";
import type { AgentStream, ApproveParams, RejectParams } from "../abstracts/adk-agent";
import type { AgentRunner } from "../runner/agent-runner";
import type { RunInput, RunResult } from "../types/events";
import type { AgentDefinition } from "./agent-definition";
import type { AgentRegistry } from "./agent-registry";

/**
 * Typed handle for an agent, obtained via AgentRegistry.getRef (registry/testing API).
 * App code injects the agent class directly: the instance itself is the handle.
 */
export class AgentRef<TAgent = unknown> {
	/** Type marker, never assigned at runtime. */
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

	/** HITL: approves a pending action, executes the tool and resumes the agent. A source (MCP) tool needs `sources` again. */
	public approve(params: ApproveParams): Promise<RunResult> {
		return this.getRunner().approve(this.agentType, params);
	}

	/** HITL: rejects a pending action, does NOT execute it and informs the agent. */
	public reject(params: RejectParams): Promise<RunResult> {
		return this.getRunner().reject(this.agentType, params);
	}

	/** The same verbs, streaming: `ref.stream.ask(...)`, `ref.stream.approve(...)`. */
	public get stream(): AgentStream {
		const runner = this.getRunner();
		return {
			ask: (input) => runner.run(this.agentType, input),
			approve: (params) => runner.approveStream(this.agentType, params),
			reject: (params) => runner.rejectStream(this.agentType, params),
		};
	}
}
