import { AdkError } from "../../../common/errors/adk.error";

/**
 * The prompt was asked for by name and the source has nothing under it.
 *
 * The message carries both the name that was asked for and where the source looked, since
 * a path that resolved somewhere unexpected is the usual reason: `support.md` under a
 * prompts directory nobody configured lands next to the working directory, not next to the
 * agent that asked for it.
 */
export class PromptNotFoundError extends AdkError {
	public readonly code = "PROMPT_NOT_FOUND";

	public constructor(
		/** Not called `name`, which every `Error` already owns and this one must keep. */
		public readonly prompt: string,
		/** Where the source looked, as it describes it. */
		public readonly location: string,
	) {
		super(`No prompt named ${prompt}. The source looked in ${location}.`);
	}
}
