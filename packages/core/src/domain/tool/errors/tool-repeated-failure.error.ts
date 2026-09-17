import { AdkError } from "../../../common/errors/adk.error";

/** The same tool failed `failures` times in a row, and the run stopped rather than keep asking. */
export class ToolRepeatedFailureError extends AdkError {
	public readonly code = "TOOL_REPEATED_FAILURE";

	public constructor(
		public readonly toolName: string,
		public readonly failures: number,
		public readonly lastReason: string,
	) {
		super(`Tool ${toolName} failed ${failures} time(s) in a row; the last reason was: ${lastReason}`);
	}
}
