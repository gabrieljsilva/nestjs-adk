import type { ToolCallId } from "../../common/identity/tool-call-id";
import { CanonicalJson } from "../../common/serialization/canonical-json";
import type { MediaPart } from "./media-part";
import { ModelMessage } from "./model-message";

/**
 * What one tool answered, tied to the call that asked for it.
 *
 * Media is held here but never sent from here: a tool role carries no image in almost any
 * provider's wire format, so the request assembly moves it into a message next to this
 * one. Keeping it on the result is what lets that move happen without guessing which
 * image came from which call.
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

	/** Canonical, and it states failure: a model that cannot see the tool failed retries it blind. */
	public get text(): string {
		const outcome = this.failed ? "failed" : "ok";
		return `${this.toolName} ${outcome} ${CanonicalJson.stringify(this.output)}`;
	}

	public get hasMedia(): boolean {
		return this.media.length > 0;
	}

	/** The same answer with the image taken off, for the request that cannot carry it here. */
	public withoutMedia(): ToolResultMessage {
		if (!this.hasMedia) return this;
		return new ToolResultMessage(this.callId, this.toolName, this.output, this.failed);
	}

	public override get characters(): number {
		return this.media.reduce((total, part) => total + part.characters, this.text.length);
	}
}
