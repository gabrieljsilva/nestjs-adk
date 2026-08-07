import { AdkError } from "../../../common/errors/adk.error";

/**
 * The file is there and the process cannot read it.
 *
 * A missing file is an absence the source reports as `undefined`, and this is the other
 * thing: a permission the deployment does not have, a device error, a name that points at
 * something which is not a file. Answering `undefined` for those would report a prompt
 * nobody wrote when what happened is a prompt nobody can open.
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
