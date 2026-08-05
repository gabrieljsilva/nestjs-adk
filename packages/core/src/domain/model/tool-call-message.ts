import type { ToolCallId } from "../../common/identity/tool-call-id";
import { CanonicalJson } from "../../common/serialization/canonical-json";
import { ModelMessage } from "./model-message";

/**
 * The model asked for a tool, with the arguments it chose.
 *
 * The signature is what the provider handed back with the call and expects to see again
 * when this turn is replayed to it. It is outside `text` on purpose: it is not something
 * the model said, so measuring or summarizing a conversation must not count it.
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

	/** Canonical, so measuring the same call twice never depends on key order. */
	public get text(): string {
		return `${this.toolName}(${CanonicalJson.stringify(this.args)})`;
	}
}
