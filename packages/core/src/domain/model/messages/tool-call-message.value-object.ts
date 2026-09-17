import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { CanonicalJson } from "../../../common/serialization/canonical-json.service";
import { ModelMessage } from "./model-message.value-object";

/**
 * The model asked for a tool, with the arguments it chose.
 * The signature is the opaque token the provider handed back with the call and expects to
 * see again on replay; it stays outside `text` so nothing measures or summarizes it.
 */
export class ToolCallMessage extends ModelMessage {
	public readonly role = "tool-call";

	public constructor(
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly args: Record<string, unknown>,
		public readonly signature?: string,
	) {
		super();
	}

	public get text(): string {
		return `${this.toolName}(${CanonicalJson.stringify(this.args)})`;
	}
}
