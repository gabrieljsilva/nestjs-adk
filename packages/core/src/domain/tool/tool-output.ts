import type { MediaPart } from "../model/media-part";

/**
 * What a tool answers when part of the answer is something to look at.
 *
 * A tool normally returns data and the runtime renders it. A chart, a screenshot or a
 * scanned page is not data the model can read, so it says so explicitly instead of
 * returning base64 inside a field, where every provider would treat it as a very long
 * string and describe it wrongly.
 *
 * The data and the image travel separately all the way through: the data is what the
 * journal records and what the tool result carries, and the image is moved next to the
 * conversation when the request is assembled, because a tool role carries no media in
 * almost any provider's wire format.
 */
export class ToolOutput {
	private constructor(
		public readonly data: unknown,
		public readonly media: readonly MediaPart[],
	) {}

	public static of(data: unknown): ToolOutput {
		return new ToolOutput(data, []);
	}

	public static with(data: unknown, media: readonly MediaPart[]): ToolOutput {
		return new ToolOutput(data, [...media]);
	}

	public get hasMedia(): boolean {
		return this.media.length > 0;
	}
}
