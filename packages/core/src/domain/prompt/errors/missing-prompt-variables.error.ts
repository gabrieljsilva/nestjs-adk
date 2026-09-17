import { AdkError } from "../../../common/errors/adk.error";

/**
 * A template declared a variable as required with `{{{name}}}` and nothing filled it. Every
 * missing key is named at once, so one run is enough to fix them all.
 */
export class MissingPromptVariablesError extends AdkError {
	public readonly code = "PROMPT_MISSING_VARIABLES";

	public constructor(
		public readonly missing: readonly string[],
		public readonly template?: string,
	) {
		super(
			`${template === undefined ? "The prompt" : `Prompt ${template}`} is missing required variables: ${missing.join(", ")}.`,
		);
	}
}
