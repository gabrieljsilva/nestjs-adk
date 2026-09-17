import { AdkError } from "@nestjs-adk/core";

/**
 * The script itself was used wrongly, such as guarding a turn that was never queued. It is the
 * test that is wrong here, not the run.
 */
export class ScriptMisuseError extends AdkError {
	public readonly code = "SCRIPT_MISUSE";

	public constructor(
		public readonly model: string,
		public readonly attempted: string,
	) {
		super(`The "${model}" script cannot ${attempted}.`);
	}
}
