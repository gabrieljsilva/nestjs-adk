import { AdkError } from "../../../common/errors/adk.error";

/**
 * The same tool failed over and over, and the run stopped rather than keep asking.
 *
 * A failure handed back to the model is a fair thing to try once: the model may have
 * called the wrong tool, or the world may have changed. Repeated identically, it is a
 * broken dependency, and continuing costs tokens to learn the same thing again.
 */
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
