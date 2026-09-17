import type { RunContext } from "../../../domain/run/run-context.value-object";
import { AgentResult } from "../../../domain/session/run/agent-result.value-object";
import { AgentRunStatus } from "../../../domain/session/run/agent-run-status.value-object";
import type { RunCostReporter } from "../../cost/run-cost-reporter.service";
import type { RunProgress } from "./run-progress.value-object";
import type { StartedRun } from "./started-run.value-object";

export class RunResultFactory {
	public constructor(private readonly costs: RunCostReporter) {}

	public async after(context: RunContext, started: StartedRun, progress: RunProgress): Promise<AgentResult> {
		return new AgentResult(
			started.run.sessionId,
			started.run.id,
			progress.isSuspended ? AgentRunStatus.SUSPENDED : AgentRunStatus.COMPLETED,
			progress.answer,
			progress.state.pendingTurn?.awaiting ?? [],
			await this.costs.report(context, progress.billed),
			progress.output,
		);
	}

	public async answering(
		context: RunContext,
		started: StartedRun,
		progress: RunProgress,
		text: string,
	): Promise<AgentResult> {
		return new AgentResult(
			started.run.sessionId,
			started.run.id,
			AgentRunStatus.COMPLETED,
			text,
			[],
			await this.costs.report(context, progress.billed),
			progress.output,
		);
	}
}
