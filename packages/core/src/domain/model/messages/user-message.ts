import type { MediaPart } from "./media-part";
import { ModelMessage } from "./model-message";

/**
 * What the user sent, verbatim, words and anything they attached.
 *
 * The attachments are outside `text` because they are not something anybody said: a
 * summary, a diff or a log line built from `text` must not suddenly contain a megabyte of
 * base64. Size counts them, because the request does.
 */
export class UserMessage extends ModelMessage {
	public readonly role = "user";

	public constructor(
		public readonly text: string,
		/** What the user attached for the model to look at, in the order they attached it. */
		public readonly media: readonly MediaPart[] = [],
	) {
		super();
	}

	public get hasMedia(): boolean {
		return this.media.length > 0;
	}

	public override get characters(): number {
		return this.media.reduce((total, part) => total + part.characters, this.text.length);
	}
}
