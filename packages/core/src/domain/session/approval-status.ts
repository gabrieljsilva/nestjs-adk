import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { PendingCall } from "./pending-call";
import type { PendingTurn } from "./pending-turn";

/**
 * What a session is waiting on a human for, ready to be shown to one.
 *
 * A caller that suspended a run in one process and reads this in another gets
 * everything an approval screen needs: which calls were held, with which arguments and
 * under which effect. Without it the caller would know a run stopped and not which call
 * to answer for, which is the one thing it has to know.
 *
 * Decided calls stay here alongside the awaiting ones. A turn released one answer at a
 * time is a turn where somebody needs to see what has already been agreed to.
 */
export class ApprovalStatus {
	private constructor(
		public readonly awaiting: readonly PendingCall[],
		public readonly decided: readonly PendingCall[],
		public readonly runId?: AgentRunId,
	) {}

	/** A session nobody is waiting on, which is every session that never suspended. */
	public static none(): ApprovalStatus {
		return new ApprovalStatus([], []);
	}

	public static of(turn: PendingTurn): ApprovalStatus {
		return new ApprovalStatus(
			turn.awaiting,
			turn.held.filter((call) => call.isDecided),
			turn.runId,
		);
	}

	public get isAwaiting(): boolean {
		return this.awaiting.length > 0;
	}

	/** Every call somebody has to answer for, answered or not, in the order the model asked. */
	public get held(): readonly PendingCall[] {
		return [...this.awaiting, ...this.decided];
	}
}
