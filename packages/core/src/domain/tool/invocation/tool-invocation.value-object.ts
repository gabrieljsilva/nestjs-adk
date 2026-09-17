import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ToolCall } from "../../model/messages/tool-call.value-object";

/** One request to run a tool, as it arrived from the model. `args` stays `unknown` until a schema has validated it. */
export class ToolInvocation {
	public constructor(
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly args: unknown,
	) {}

	public static from(call: ToolCall): ToolInvocation {
		return new ToolInvocation(call.callId, call.toolName, call.args);
	}
}
