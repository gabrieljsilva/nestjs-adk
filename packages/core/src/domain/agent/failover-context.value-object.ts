import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { ModelFailure } from "../model/failures/model-failure.value-object";
import type { LlmModel } from "../model/llm-model.contract";

/**
 * What the run knows when a model fails, handed to the failover policy so it can decide.
 * The lists are copies, so a policy may keep the context it decided on while the run carries on.
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

	public get attempts(): number {
		return this.attempted.length;
	}

	public hasTried(model: LlmModel): boolean {
		return this.attempted.includes(model);
	}
}
