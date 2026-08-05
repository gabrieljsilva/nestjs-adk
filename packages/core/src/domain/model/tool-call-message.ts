import type { ToolCallId } from "../../common/identity/tool-call-id";
import { CanonicalJson } from "../../common/serialization/canonical-json";
import { ModelMessage } from "./model-message";

/** The model asked for a tool, with the arguments it chose. */
export class ToolCallMessage extends ModelMessage {
	public readonly role = "tool-call";

	public constructor(
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly args: Record<string, unknown>,
	) {
		super();
	}

	/** Canonical, so measuring the same call twice never depends on key order. */
	public get text(): string {
		return `${this.toolName}(${CanonicalJson.stringify(this.args)})`;
	}
}
