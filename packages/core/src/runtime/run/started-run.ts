import type { AgentRun } from "../../domain/session/agent-run";
import type { RunCancellation } from "../lifecycle/run-cancellation";

/** A run that is executing, paired with the handle that can stop it. */
export class StartedRun {
	public constructor(
		public readonly run: AgentRun,
		public readonly cancellation: RunCancellation,
	) {}
}
