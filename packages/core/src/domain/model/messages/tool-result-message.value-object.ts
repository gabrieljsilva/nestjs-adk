import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { CanonicalJson } from "../../../common/serialization/canonical-json.service";
import type { MediaPart } from "./media-part.value-object";
import { ModelMessage } from "./model-message.value-object";

/**
 * What one tool answered, tied to the call that asked for it.
 * Media is held here but never sent from here: almost no provider's tool role carries an
 * image, so request assembly moves it into a message next to this one.
 */
export class ToolResultMessage extends ModelMessage {
	public readonly role = "tool-result";

	public constructor(
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly output: Record<string, unknown>,
		public readonly failed: boolean,
		public readonly media: readonly MediaPart[] = [],
	) {
		super();
	}

	public get text(): string {
		const outcome = this.failed ? "failed" : "ok";
		return `${this.toolName} ${outcome} ${CanonicalJson.stringify(this.output)}`;
	}

	public get hasMedia(): boolean {
		return this.media.length > 0;
	}

	public withoutMedia(): ToolResultMessage {
		if (!this.hasMedia) return this;
		return new ToolResultMessage(this.callId, this.toolName, this.output, this.failed);
	}

	public override get characters(): number {
		return this.media.reduce((total, part) => total + part.characters, this.text.length);
	}
}
