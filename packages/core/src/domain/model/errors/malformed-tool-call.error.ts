import { AdkError } from "../../../common/errors/adk.error";

/**
 * The model asked for a tool with arguments that never became an object.
 * Truncated JSON is the usual cause, and running the tool on half of it would be
 * executing a request nobody made.
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
