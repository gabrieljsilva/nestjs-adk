import type { AgentRun } from "../../../domain/session/run/agent-run.entity";
import type { RunCancellation } from "../../lifecycle/run-cancellation.service";

export class StartedRun {
	public constructor(
		public readonly run: AgentRun,
		public readonly cancellation: RunCancellation,
	) {}
}
