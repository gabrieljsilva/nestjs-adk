import type { SessionId } from "../../common/identity/session-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { ToolSource } from "../../contracts/tool-source";

/**
 * The command that refuses a tool call a human had to authorize.
 *
 * It takes sources for the same reason an approval does: refusing one call still runs the
 * turn, and the other calls of that turn may have come from a source that has to be open.
 */
export class RejectInput {
	private constructor(
		public readonly sessionId: SessionId,
		public readonly callId: ToolCallId,
		public readonly reason: string,
		public readonly deniedBy?: string,
		public readonly sources: readonly ToolSource[] = [],
	) {}

	public static of(
		sessionId: SessionId,
		callId: ToolCallId,
		reason: string,
		deniedBy?: string,
		sources: readonly ToolSource[] = [],
	): RejectInput {
		return new RejectInput(sessionId, callId, reason.trim(), deniedBy, sources);
	}
}
