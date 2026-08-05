import type { SessionId } from "../../common/identity/session-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";

/** The command that releases a tool call a human had to authorize. */
export class ApproveInput {
	private constructor(
		public readonly sessionId: SessionId,
		public readonly callId: ToolCallId,
		public readonly approvedBy?: string,
	) {}

	public static of(sessionId: SessionId, callId: ToolCallId, approvedBy?: string): ApproveInput {
		return new ApproveInput(sessionId, callId, approvedBy);
	}
}
