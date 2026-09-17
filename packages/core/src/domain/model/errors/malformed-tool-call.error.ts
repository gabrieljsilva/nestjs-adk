import { AdkError } from "../../../common/errors/adk.error";

/**
 * The model asked for a tool with arguments that never parsed into an object, usually
 * truncated JSON. The tool is not run.
 */
export class MalformedToolCallError extends AdkError {
	public readonly code = "MODEL_MALFORMED_TOOL_CALL";

	public constructor(
		public readonly toolName: string,
		public readonly received: string,
	) {
		super(`Model asked for ${toolName} with arguments that are not a JSON object: ${received}`);
	}
}
