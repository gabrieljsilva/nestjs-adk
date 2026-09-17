import { AdkError } from "../../../common/errors/adk.error";

/**
 * A tool source would not let the runtime in, and somebody has to authorize it again.
 * It is recorded and does not end the run: the tools that did open stay usable.
 */
export class ToolSourceAuthError extends AdkError {
	public readonly code = "TOOL_SOURCE_AUTH";

	public constructor(
		public readonly source: string,
		public readonly reason: string,
	) {
		super(`Tool source ${source} needs to be authorized again: ${reason}`);
	}
}
