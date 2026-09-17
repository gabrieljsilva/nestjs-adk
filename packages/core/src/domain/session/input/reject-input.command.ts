import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import type { ToolSource } from "../../../contracts/tool/tool-source.contract";
import type { Actor } from "../../tool/access/actor.value-object";

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
		/** The stop button of the turn this decision releases, which is a run of its own. */
		public readonly signal?: AbortSignal,
		public readonly actor?: Actor,
		public readonly toolCalls?: ToolCallObserver,
	) {}

	public static of(
		sessionId: SessionId,
		callId: ToolCallId,
		reason: string,
		deniedBy?: string,
		sources: readonly ToolSource[] = [],
		signal?: AbortSignal,
		actor?: Actor,
		toolCalls?: ToolCallObserver,
	): RejectInput {
		return new RejectInput(sessionId, callId, reason.trim(), deniedBy, sources, signal, actor, toolCalls);
	}
}
