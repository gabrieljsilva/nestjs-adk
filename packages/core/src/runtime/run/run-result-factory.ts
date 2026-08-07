import { AgentResult } from "../../domain/session/agent-result";
import { AgentRunStatus } from "../../domain/session/agent-run-status";
import type { RunCostReporter } from "../cost/run-cost-reporter";
import type { RunProgress } from "./run-progress";
import type { StartedRun } from "./started-run";

/**
 * Builds what a command answers with, once the run has stopped running.
 *
 * It exists because pricing is the last thing that happens and it is I/O: three commands used to
 * assemble the same result inline, and adding an `await` to each of them would have put the same
 * catalog call in three places. Here it is one call, after the loop, on the calls the run
 * collected.
 */
export class RunResultFactory {
	public constructor(private readonly costs: RunCostReporter) {}

	/** How a run that went through the loop ends, whether it answered or stopped to wait. */
	public async after(started: StartedRun, progress: RunProgress): Promise<AgentResult> {
		return new AgentResult(
			started.run.sessionId,
			started.run.id,
			progress.isSuspended ? AgentRunStatus.SUSPENDED : AgentRunStatus.COMPLETED,
			progress.answer,
			progress.state.pendingTurn?.awaiting ?? [],
			await this.costs.report(progress.billed),
		);
	}

	/**
	 * How a delegation asked for from code ends.
	 *
	 * The answer is the specialist's and not whatever the parent last said, and there is nothing
	 * awaiting: a delegation that suspended never gets here, because a parent cannot answer for a
	 * call its child is waiting on.
	 */
	public async answering(started: StartedRun, progress: RunProgress, text: string): Promise<AgentResult> {
		return new AgentResult(
			started.run.sessionId,
			started.run.id,
			AgentRunStatus.COMPLETED,
			text,
			[],
			await this.costs.report(progress.billed),
		);
	}
}
