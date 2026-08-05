import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { LlmModel } from "../model/llm-model";
import type { ModelFailure } from "../model/model-failure";

/**
 * What the run knows when a model fails, handed to the policy so it can decide.
 *
 * This is exactly the knowledge a model lacks, and the reason failover is a policy of
 * the agent rather than a feature of the model.
 *
 * It copies what it is given. A policy may keep the context it decided on, and the run
 * keeps attempting models afterwards; sharing the live lists would let a later attempt
 * rewrite the history of an earlier decision.
 */
export class FailoverContext {
	public readonly attempted: readonly LlmModel[];
	public readonly failures: readonly ModelFailure[];

	public constructor(
		public readonly runId: AgentRunId,
		public readonly current: LlmModel,
		attempted: readonly LlmModel[],
		failures: readonly ModelFailure[],
	) {
		this.attempted = [...attempted];
		this.failures = [...failures];
	}

	/** How many model calls this request already made, the current one included. */
	public get attempts(): number {
		return this.attempted.length;
	}

	public hasTried(model: LlmModel): boolean {
		return this.attempted.includes(model);
	}
}
