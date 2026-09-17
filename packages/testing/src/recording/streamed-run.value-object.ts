import type { ModelChunk } from "@nestjs-adk/core";
import { RecordedRun } from "./recorded-run.value-object";

/**
 * A recorded run plus the pieces the answer arrived in: `textDeltas`, and `wasStreamed` for
 * whether the whole answer came in one chunk.
 */
export class StreamedRun extends RecordedRun {
	public constructor(
		run: RecordedRun,
		public readonly chunks: readonly ModelChunk[],
	) {
		super(run, run.events);
	}

	public get textDeltas(): readonly string[] {
		return this.chunks.filter((chunk) => chunk.hasText).map((chunk) => chunk.textDelta);
	}

	public get wasStreamed(): boolean {
		return this.textDeltas.length > 1;
	}
}
