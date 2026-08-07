import { AdkError } from "../../../common/errors/adk.error";

/**
 * A template declared a variable as required and nothing filled it.
 *
 * Every missing key is named at once rather than one per attempt, because a prompt with
 * four required variables would otherwise take four runs to configure. The names are the
 * ones written in the template, so what the message says is what has to be typed.
 */
export class MissingPromptVariablesError extends AdkError {
	public readonly code = "PROMPT_MISSING_VARIABLES";

	public constructor(
		public readonly missing: readonly string[],
		/** Which template, when it came from somewhere with a name, such as a file. */
		public readonly template?: string,
	) {
		super(
			`${template === undefined ? "The prompt" : `Prompt ${template}`} is missing required variables: ${missing.join(", ")}.`,
		);
	}
}
