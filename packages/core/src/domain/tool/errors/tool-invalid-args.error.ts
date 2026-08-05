import { AdkError } from "../../../common/errors/adk.error";

/**
 * The model kept writing arguments the tool cannot accept, and the run stopped.
 *
 * Invalid arguments are handed back for the model to fix, but only so many times: a
 * model that cannot satisfy a schema will not satisfy it on the tenth try either, and
 * every try is billed. The limit is what turns a loop into a failure someone can read.
 */
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
