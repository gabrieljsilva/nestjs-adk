import { AdkError } from "../../../common/errors/adk.error";

/**
 * Nothing in this session is waiting on the call that was just decided.
 *
 * Usually it means the decision arrived twice, and refusing the second one is the whole
 * point: an approval that ran a tool once must not run it again because a button was
 * clicked twice or a webhook was delivered twice.
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
