import type { ToolCallId } from "../../common/identity/tool-call-id";
import { CanonicalJson } from "../../common/serialization/canonical-json";
import { ModelMessage } from "./model-message";

/** What one tool answered, tied to the call that asked for it. */
export class ToolResultMessage extends ModelMessage {
	public readonly role = "tool-result";

	public constructor(
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly output: Record<string, unknown>,
		public readonly failed: boolean,
	) {
		super();
	}

	/** Canonical, and it states failure: a model that cannot see the tool failed retries it blind. */
	public get text(): string {
		const outcome = this.failed ? "failed" : "ok";
		return `${this.toolName} ${outcome} ${CanonicalJson.stringify(this.output)}`;
	}
}
