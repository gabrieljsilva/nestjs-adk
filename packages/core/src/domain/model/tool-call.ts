import type { ToolCallId } from "../../common/identity/tool-call-id";

/**
 * One complete tool call, assembled from everything the stream carried about it.
 *
 * A call is only a call once its arguments parse: half of a JSON object is not a
 * smaller request, it is an unanswerable one. The aggregator is what turns fragments
 * into this, and refuses to build one it cannot complete.
 *
 * The signature travels with the call because the provider that issued it will not accept
 * the next turn without it. It is opaque and stays opaque: the runtime carries it, stores
 * it and hands it back, and never reads it.
 */
export class ToolCall {
	public constructor(
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly args: Record<string, unknown>,
		public readonly signature?: string,
	) {}
}
