import type { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import type { PendingCall } from "./pending-call.value-object";
import type { PendingTurn } from "./pending-turn.value-object";

export class ApprovalStatus {
	private constructor(
		public readonly awaiting: readonly PendingCall[],
		public readonly decided: readonly PendingCall[],
		public readonly runId?: AgentRunId,
	) {}

	public static none(): ApprovalStatus {
		return new ApprovalStatus([], []);
	}

	public static fromTurn(turn: PendingTurn): ApprovalStatus {
		return new ApprovalStatus(
			turn.awaiting,
			turn.held.filter((call) => call.isDecided),
			turn.runId,
		);
	}

	public get isAwaiting(): boolean {
		return this.awaiting.length > 0;
	}

	public get held(): readonly PendingCall[] {
		return [...this.awaiting, ...this.decided];
	}
}
