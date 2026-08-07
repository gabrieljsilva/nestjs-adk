import type { ModelChunk } from "@nestjs-adk/core";
import { RecordedRun } from "./recorded-run";

/**
 * A watched run: everything a run answered, plus the pieces it was delivered in.
 *
 * It extends `RecordedRun` rather than wrapping it, so every matcher and every assertion a
 * test already writes about a run keeps working, and the chunks are one more piece of
 * evidence travelling with it instead of a second object to correlate.
 *
 * The pieces are what a UI would have rendered as they arrived. Asserting on them is how a
 * caller that collects everything and paints it at the end is told apart from one that
 * paints as it goes: both end with the same text.
 */
export class StreamedRun extends RecordedRun {
	public constructor(
		run: RecordedRun,
		public readonly chunks: readonly ModelChunk[],
	) {
		super(run, run.events);
	}

	/** The text pieces, in the order the provider sent them. */
	public get textDeltas(): readonly string[] {
		return this.chunks.filter((chunk) => chunk.hasText).map((chunk) => chunk.textDelta);
	}

	/** Whether the answer arrived in more than one piece, which is the whole point of streaming. */
	public get wasStreamed(): boolean {
		return this.textDeltas.length > 1;
	}
}
