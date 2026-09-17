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
export interface ApproveParams {
	sessionId: SessionId;
	callId: ToolCallId;
	approvedBy?: string;
	sources?: readonly ToolSource[];
	/** The stop button of the turn this decision releases, which is a run of its own. */
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
