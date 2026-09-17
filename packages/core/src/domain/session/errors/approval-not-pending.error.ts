import { AdkError } from "../../../common/errors/adk.error";

/**
 * Nothing in this session is waiting on the call that was just decided.
 * It is what a double click or a duplicated webhook hits: at most one decision per call.
 */
export class ApprovalNotPendingError extends AdkError {
	public readonly code = "APPROVAL_NOT_PENDING";

	public constructor(
		public readonly sessionId: string,
		public readonly callId: string,
	) {
		super(`Session ${sessionId} is not waiting for a decision on call ${callId}.`);
	}
}
