import { AdkError } from "../../../common/errors/adk.error";

/** Raised at boot: `prompts` configures the filesystem source that `promptSource` replaces, so declaring both leaves a directory nothing reads. */
export class ConflictingPromptOptionsError extends AdkError {
	public readonly code = "CONFLICTING_PROMPT_OPTIONS";

	public constructor() {
		super(
			"AdkModule declares both promptSource and prompts.dir. A custom source decides where its prompts live, so pass the directory to it instead.",
		);
	}
}
