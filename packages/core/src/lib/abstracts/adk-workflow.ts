import { Inject, type Type } from "@nestjs/common";
import { ADK_RUNNER } from "../constants";
import type { AgentRunner } from "../runner/agent-runner";
import type { RunInput, RunResult } from "../types/events";
import type { AgentStream } from "./adk-agent";

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

	/** The same verbs as AdkAgent, streaming: `workflow.stream.ask(...)`. */
	public get stream(): AgentStream {
		const type = this.constructor as Type;
		const runner = this.adkRunner;
		return {
			ask: (input) => runner.run(type, input),
			approve: (params) => runner.approveStream(type, params),
			reject: (params) => runner.rejectStream(type, params),
		};
	}
}
