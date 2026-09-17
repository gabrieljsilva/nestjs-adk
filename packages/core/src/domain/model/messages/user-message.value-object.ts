import type { MediaPart } from "./media-part.value-object";
import { ModelMessage } from "./model-message.value-object";

/**
 * What the user sent, verbatim: words, and anything they attached.
 * The attachments stay outside `text` so nothing built from it carries a megabyte of
 * base64, while `characters` counts them because the request does.
 */
export class UserMessage extends ModelMessage {
	public readonly role = "user";

	public constructor(
		public readonly text: string,
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
