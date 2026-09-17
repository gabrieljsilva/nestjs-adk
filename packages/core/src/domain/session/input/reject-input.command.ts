import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import type { ToolSource } from "../../../contracts/tool/tool-source.contract";
import type { Actor } from "../../tool/access/actor.value-object";

/**
 * What refusing a tool call a human had to authorize needs.
 *
 * It takes sources for the same reason an approval does: refusing one call still runs the
 * turn, and the other calls of that turn may have come from a source that has to be open.
 */
export interface RejectParams {
	sessionId: SessionId;
	callId: ToolCallId;
	reason: string;
	deniedBy?: string;
	sources?: readonly ToolSource[];
	signal?: AbortSignal;
	actor?: Actor;
	toolCalls?: ToolCallObserver;
}

export class RejectInput {
	public readonly sessionId: SessionId;
	public readonly callId: ToolCallId;
	public readonly reason: string;
	public readonly deniedBy?: string;
	public readonly sources: readonly ToolSource[];
	public readonly signal?: AbortSignal;
	public readonly actor?: Actor;
	public readonly toolCalls?: ToolCallObserver;

	public constructor(params: RejectParams) {
		this.sessionId = params.sessionId;
		this.callId = params.callId;
		this.reason = params.reason.trim();
		this.deniedBy = params.deniedBy;
		this.sources = params.sources ?? [];
		this.signal = params.signal;
		this.actor = params.actor;
		this.toolCalls = params.toolCalls;
	}
}
