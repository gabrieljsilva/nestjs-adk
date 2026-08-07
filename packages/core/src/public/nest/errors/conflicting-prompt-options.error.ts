import { AdkError } from "../../../common/errors/adk.error";

/**
 * The module declared both a prompt source and a directory for the one it replaced.
 *
 * `prompts.dir` configures the filesystem source, and `promptSource` is what takes its
 * place. Together, one of them is a setting nothing reads, which looks exactly like a
 * configured directory until a prompt is not found where it was supposed to be.
 */
export class ConflictingPromptOptionsError extends AdkError {
	public readonly code = "CONFLICTING_PROMPT_OPTIONS";

	public constructor() {
		super(
			"AdkModule declares both promptSource and prompts.dir. A custom source decides where its prompts live, so pass the directory to it instead.",
		);
	}
}
