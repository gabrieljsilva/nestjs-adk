import type { AttachmentReference } from "./attachment-reference";
import type { MediaPart } from "./media-part";

/**
 * What one attachment becomes in the context being built, this time.
 *
 * Three answers, because dropping media is only safe with a vocabulary for it. `media`
 * puts the attachment in front of the model. `note` puts a line of text where it stood,
 * so a message that says "describe this image" still reads coherently when the image is
 * not sent. `omit` leaves it out entirely, which is the honest shape of "not this turn".
 *
 * None of it is recorded anywhere: the journal keeps the reference, and this answer is
 * consumed by the one projection that asked for it.
 */
export class AttachmentProjection {
	private constructor(
		public readonly part?: MediaPart,
		public readonly text?: string,
	) {}

	/** The model sees the media. */
	public static media(part: MediaPart): AttachmentProjection {
		return new AttachmentProjection(part);
	}

	/** Text stands in for the media, appended after the message it was attached to. */
	public static note(text: string): AttachmentProjection {
		return new AttachmentProjection(undefined, text);
	}

	/** The attachment leaves the context, with nothing said about it. */
	public static omit(): AttachmentProjection {
		return new AttachmentProjection();
	}

	/**
	 * A note in the one vocabulary every stand-in line uses, so a model reads the same
	 * shape whether the image was dropped by a resolver, a failure or a capability gap.
	 */
	public static noteFor(reference: AttachmentReference, reason: string): AttachmentProjection {
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
