import { AdkError } from "@nestjs-adk/core";

/** A strict script was asked for a turn it does not have, which means the run went further than the test said it would. */
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
