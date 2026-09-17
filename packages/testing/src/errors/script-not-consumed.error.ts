import { AdkError } from "@nestjs-adk/core";

/**
 * Raised by `AdkTestBed.verify` when turns nobody played are still queued: the run ended before
 * the conversation the test described.
 */
export class ScriptNotConsumedError extends AdkError {
	public readonly code = "SCRIPT_NOT_CONSUMED";

	public constructor(
		public readonly model: string,
		public readonly pending: number,
	) {
		super(
			`The "${model}" script still holds ${pending} turn(s) nobody played. The run ended before the conversation the test described; drop the extra turns or assert why the run stopped early.`,
		);
	}
}
