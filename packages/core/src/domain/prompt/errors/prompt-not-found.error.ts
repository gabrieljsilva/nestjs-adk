import { AdkError } from "../../../common/errors/adk.error";

/**
 * The prompt was asked for by name and the source has nothing under it. The message carries
 * both the name and where the source looked, since a path resolving somewhere unexpected is
 * the usual cause.
 */
export class PromptNotFoundError extends AdkError {
	public readonly code = "PROMPT_NOT_FOUND";

	public constructor(
		// Not `name`: every `Error` already owns that property.
		public readonly prompt: string,
		public readonly location: string,
	) {
		super(`No prompt named ${prompt}. The source looked in ${location}.`);
	}
}
