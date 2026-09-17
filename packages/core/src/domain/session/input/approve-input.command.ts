import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import type { ToolSource } from "../../../contracts/tool/tool-source.contract";
import type { Actor } from "../../tool/access/actor.value-object";

/**
 * What releasing a tool call a human had to authorize needs.
 *
 * The sources are declared again here because an approval is a new run, possibly in another
 * process days later: a tool that came from a source is only runnable now if it is opened now.
 */
export interface ApproveParams {
	sessionId: SessionId;
	callId: ToolCallId;
	approvedBy?: string;
	sources?: readonly ToolSource[];
	signal?: AbortSignal;
	actor?: Actor;
	toolCalls?: ToolCallObserver;
}

export class ApproveInput {
	public readonly sessionId: SessionId;
	public readonly callId: ToolCallId;
	public readonly approvedBy?: string;
	public readonly sources: readonly ToolSource[];
	public readonly signal?: AbortSignal;
	public readonly actor?: Actor;
	public readonly toolCalls?: ToolCallObserver;

	public constructor(params: ApproveParams) {
		this.sessionId = params.sessionId;
		this.callId = params.callId;
		this.approvedBy = params.approvedBy;
		this.sources = params.sources ?? [];
		this.signal = params.signal;
		this.actor = params.actor;
		this.toolCalls = params.toolCalls;
	}
}
