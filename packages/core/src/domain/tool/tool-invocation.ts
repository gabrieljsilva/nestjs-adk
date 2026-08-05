import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { ToolCall } from "../model/tool-call";

/**
 * One request to run a tool, as it arrived from the model.
 *
 * The arguments are `unknown` on purpose and stay that way until a schema has looked at
 * them: a model wrote them, nothing validated them yet, and typing them as a record here
 * would be a claim nobody has checked.
 */
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
