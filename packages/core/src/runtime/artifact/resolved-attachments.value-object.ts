import type { MediaPart } from "../../domain/model/messages/media-part.value-object";

/**
 * What a message's attachments became for the context being built: the media the model
 * will see, and the lines standing in for what it will not.
 *
 * The two lists lose the interleaving on purpose. A note reads as part of the message
 * text, after it, the same way `MediaFit` writes its placeholder, so the media keeps its
 * position and the words keep reading as one message.
 */
export class ResolvedAttachments {
	public constructor(
		public readonly media: readonly MediaPart[],
		public readonly notes: readonly string[],
	) {}

	public static none(): ResolvedAttachments {
		return new ResolvedAttachments([], []);
	}

	/** The text with every note after it, or the text alone when nothing stood in. */
	public appendTo(text: string): string {
		if (this.notes.length === 0) return text;
		return `${text}\n\n${this.notes.join("\n")}`;
	}

	/**
	 * A tool's output with the notes under a bracketed key no tool writes, or untouched
	 * when there are none. The record only exists in the projection: what the journal
	 * holds is the tool's own answer.
	 */
	public annotate(output: Record<string, unknown>): Record<string, unknown> {
		if (this.notes.length === 0) return output;
		return { ...output, "[attachments]": this.notes.join("\n") };
	}
}
