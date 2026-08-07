import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { SessionId } from "../../common/identity/session-id";
import { RunCost } from "../cost/run-cost";
import type { AgentRunStatus } from "./agent-run-status";
import type { PendingCall } from "./pending-call";

/**
 * What a command answers with.
 *
 * The session id always comes back, including for a session the caller did not name, so
 * a follow up can continue the same conversation.
 *
 * A run that suspended comes back with the calls somebody has to answer for. Without
 * them a caller would know the run stopped and not which call to decide on, which is the
 * one thing it has to know to carry on. The same calls are readable later through an
 * inspection, for a process that did not make this call.
 *
 * The cost is always here and never absent, including for a runtime that declared no pricing
 * source. It reads zero then, and `cost.isComplete` is what tells a caller whether that zero
 * is a run that was free or a run nobody could price.
 */
export class AgentResult {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly runId: AgentRunId,
		public readonly status: AgentRunStatus,
		public readonly text: string,
		public readonly awaiting: readonly PendingCall[] = [],
		public readonly cost: RunCost = RunCost.nothing(),
	) {}

	public get isAwaitingApproval(): boolean {
		return this.awaiting.length > 0;
	}
}
