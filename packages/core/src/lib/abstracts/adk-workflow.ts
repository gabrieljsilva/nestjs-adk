import { Inject, type Type } from "@nestjs/common";
import { ADK_RUNNER } from "../constants";
import type { AgentRunner } from "../runner/agent-runner";
import type { AgentEvent, RunInput, RunResult } from "../types/events";

/**
 * Base contract for deterministic workflows (@WorkflowAgent). Workflows are agents:
 * they can be sub-agents, and the instance is the execution handle (plain Nest DI).
 */
export abstract class AdkWorkflow {
	@Inject(ADK_RUNNER)
	private readonly adkRunner!: AgentRunner;

	/** Aggregates final text + usage + trace; AiEmptyResponseError on an empty response. */
	public ask(input: RunInput): Promise<RunResult> {
		return this.adkRunner.ask(this.constructor as Type, input);
	}

	/** Normalized event loop (streaming). */
	public stream(input: RunInput): AsyncGenerator<AgentEvent> {
		return this.adkRunner.run(this.constructor as Type, input);
	}
}
