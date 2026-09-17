import { AdkError } from "../../../common/errors/adk.error";

/** The model wrote arguments the tool cannot accept `attempts` times, and the run stopped instead of asking again. */
export class ToolInvalidArgsError extends AdkError {
	public readonly code = "TOOL_INVALID_ARGS";

	public constructor(
		public readonly toolName: string,
		public readonly attempts: number,
		public readonly lastReason: string,
	) {
		super(`Tool ${toolName} received invalid arguments ${attempts} time(s); the last reason was: ${lastReason}`);
	}
}
