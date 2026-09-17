import { AdkError } from "@nestjs-adk/core";

/**
 * The run asked for another turn and the script has nothing left to play: either a turn is
 * missing from the queue, or the assertion belongs one turn earlier.
 */
export class ScriptExhaustedError extends AdkError {
	public readonly code = "SCRIPT_EXHAUSTED";

	public constructor(
		public readonly model: string,
		public readonly played: number,
	) {
		super(
			`The "${model}" script has nothing left to play: all ${played} scripted turns were consumed and the run asked for another. Queue the missing turn or assert one turn earlier.`,
		);
	}
}
