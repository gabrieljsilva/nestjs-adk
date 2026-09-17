import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";

export class ToolCall {
	public constructor(
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly args: Record<string, unknown>,
		public readonly signature?: string,
	) {}
}
