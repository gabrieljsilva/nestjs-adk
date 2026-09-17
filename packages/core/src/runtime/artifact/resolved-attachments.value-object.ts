import type { MediaPart } from "../../domain/model/messages/media-part.value-object";

export class ResolvedAttachments {
	public constructor(
		public readonly media: readonly MediaPart[],
		public readonly notes: readonly string[],
	) {}

	public static none(): ResolvedAttachments {
		return new ResolvedAttachments([], []);
	}

	public appendTo(text: string): string {
		if (this.notes.length === 0) return text;
		return `${text}\n\n${this.notes.join("\n")}`;
	}

	public annotate(output: Record<string, unknown>): Record<string, unknown> {
		if (this.notes.length === 0) return output;
		return { ...output, "[attachments]": this.notes.join("\n") };
	}
}
