import { AdkError } from "../../../common/errors/adk.error";

/**
 * A tool source could not be reached, which is not the same as refusing to let anybody in.
 *
 * Like an authorization failure it does not end the run: a conversation with fewer tools
 * is worth more than no conversation. Unlike one, nobody can fix it by signing in again,
 * so the two are separate errors rather than one with a flag.
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
