import type { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import type { SessionId } from "../../../common/identity/session-id.value-object";
import { RunCost } from "../../cost/run-cost.value-object";
import type { PendingCall } from "../approval/pending-call.value-object";
import type { AgentRunStatus } from "./agent-run-status.value-object";

/**
 * What a command answers with. The session id always comes back, including for a session the
 * caller did not name, and a run that suspended comes back with the calls somebody has to answer
 * for. The cost is never absent: `cost.isComplete` tells a caller whether a zero is a free run
 * or one nobody could price.
 */
export class AgentResult {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly runId: AgentRunId,
		public readonly status: AgentRunStatus,
		public readonly text: string,
		public readonly awaiting: readonly PendingCall[] = [],
		public readonly cost: RunCost = RunCost.nothing(),
		public readonly output?: unknown,
	) {}

	public get isAwaitingApproval(): boolean {
		return this.awaiting.length > 0;
	}
}
