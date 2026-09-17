import { AdkError } from "../../../common/errors/adk.error";

/**
 * The prompt file is there and the process cannot read it: a permission, a device error, a name
 * that points at something which is not a file. A missing file is not this, it is reported as
 * `undefined`.
 */
export class PromptFileUnreadableError extends AdkError {
	public readonly code = "PROMPT_FILE_UNREADABLE";

	public constructor(
		public readonly path: string,
		cause: unknown,
	) {
		super(`Cannot read the prompt file at ${path}.`, { cause });
	}
}
