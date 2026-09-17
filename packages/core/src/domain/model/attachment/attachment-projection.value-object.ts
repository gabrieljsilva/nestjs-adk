import type { MediaPart } from "../messages/media-part.value-object";
import type { AttachmentReference } from "./attachment-reference.value-object";

/**
 * What one attachment becomes in the context being built: `media` puts it in front of the
 * model, `note` puts a line of text where it stood, `omit` leaves it out.
 * The answer is never recorded; only the reference in the journal is.
 */
export class AttachmentProjection {
	private constructor(
		public readonly part?: MediaPart,
		public readonly text?: string,
	) {}

	public static media(part: MediaPart): AttachmentProjection {
		return new AttachmentProjection(part);
	}

	public static note(text: string): AttachmentProjection {
		return new AttachmentProjection(undefined, text);
	}

	public static omit(): AttachmentProjection {
		return new AttachmentProjection();
	}

	public static fromReference(reference: AttachmentReference, reason: string): AttachmentProjection {
		const type = reference.mediaType;
		const name = type === undefined ? "attachment" : `attachment ${type}`;
		return AttachmentProjection.note(`[${name}: ${reason}]`);
	}

	public get isMedia(): boolean {
		return this.part !== undefined;
	}

	public get isNote(): boolean {
		return this.text !== undefined;
	}
}
