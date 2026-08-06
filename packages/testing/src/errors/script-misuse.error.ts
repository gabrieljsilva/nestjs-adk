import { AdkError } from "@nestjs-adk/core";

/** The script builder was used in an order that cannot mean anything, such as guarding a turn that was never queued. */
export class ScriptMisuseError extends AdkError {
	public readonly code = "SCRIPT_MISUSE";

	public constructor(
		public readonly model: string,
		public readonly attempted: string,
	) {
		super(`The "${model}" script cannot ${attempted}.`);
	}
}
