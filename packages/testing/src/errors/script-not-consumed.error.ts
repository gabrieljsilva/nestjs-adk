import { AdkError } from "@nestjs-adk/core";

/** The test ended with scripted turns nobody played, so the conversation it described never happened. */
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
