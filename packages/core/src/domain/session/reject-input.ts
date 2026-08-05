import type { SessionId } from "../../common/identity/session-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";

/** The command that refuses a tool call a human had to authorize. */
export class RejectInput {
	private constructor(
		public readonly sessionId: SessionId,
		public readonly callId: ToolCallId,
		public readonly reason: string,
		public readonly deniedBy?: string,
	) {}

	public static of(sessionId: SessionId, callId: ToolCallId, reason: string, deniedBy?: string): RejectInput {
		return new RejectInput(sessionId, callId, reason.trim(), deniedBy);
	}
}
