import type { MediaPart } from "../../model/messages/media-part.value-object";

/**
 * What a tool answers when part of the answer is something to look at rather than data.
 * `data` is what the journal records; the media is moved beside the conversation when the request
 * is assembled, because a tool result carries no media in almost any provider's wire format.
 */
export class ToolOutput {
	public readonly media: readonly MediaPart[];

	public constructor(
		public readonly data: unknown,
		media: readonly MediaPart[] = [],
	) {
		this.media = [...media];
	}

	public get hasMedia(): boolean {
		return this.media.length > 0;
	}
}
