import { AdkError } from "@nestjs-adk/core";

/** A suite that needs a provider key ran without one. */
export class MissingApiKeyError extends AdkError {
	public readonly code = "MISSING_API_KEY";

	public constructor(public readonly variables: readonly string[]) {
		super(`No API key found. Set one of: ${variables.join(", ")}.`);
	}
}
