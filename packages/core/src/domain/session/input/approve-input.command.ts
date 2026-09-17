import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import type { ToolSource } from "../../../contracts/tool/tool-source.contract";
import type { Actor } from "../../tool/access/actor.value-object";

/**
 * The command that releases a tool call a human had to authorize.
 *
 * The sources are declared again here, and that is not a repetition of the question that
 * suspended: an approval is a new run in a new process minutes or days later, and the
 * connection the first run opened is long closed. A tool that came from a source is only
 * runnable now if the source is opened now.
 */
export class ApproveInput {
	private constructor(
		public readonly sessionId: SessionId,
		public readonly callId: ToolCallId,
		public readonly approvedBy?: string,
		public readonly sources: readonly ToolSource[] = [],
		/** The stop button of the turn this decision releases, which is a run of its own. */
		public readonly signal?: AbortSignal,
		public readonly actor?: Actor,
		public readonly toolCalls?: ToolCallObserver,
	) {}

	public static of(
		sessionId: SessionId,
		callId: ToolCallId,
		approvedBy?: string,
		sources: readonly ToolSource[] = [],
		signal?: AbortSignal,
		actor?: Actor,
		toolCalls?: ToolCallObserver,
	): ApproveInput {
		return new ApproveInput(sessionId, callId, approvedBy, sources, signal, actor, toolCalls);
	}
}
