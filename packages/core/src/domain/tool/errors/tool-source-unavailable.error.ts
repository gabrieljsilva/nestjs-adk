import { AdkError } from "../../../common/errors/adk.error";

/**
 * A tool source could not be reached. Like an authorization failure it does not end the run,
 * but nobody can fix it by signing in again.
 */
export class ToolSourceUnavailableError extends AdkError {
	public readonly code = "TOOL_SOURCE_UNAVAILABLE";

	public constructor(
		public readonly source: string,
		public readonly cause?: unknown,
	) {
		super(`Tool source ${source} could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`);
	}
}
