import { AdkError } from "../../../common/errors/adk.error";

/** Raised at boot: two `@McpController` classes publish the same tool name, and an MCP server has one flat list. */
export class DuplicateExposedToolError extends AdkError {
	public readonly code = "NEST_DUPLICATE_EXPOSED_TOOL";

	public constructor(
		public readonly toolName: string,
		public readonly first: string,
		public readonly second: string,
	) {
		super(
			`Tool ${toolName} is exposed by both ${first} and ${second}. An MCP server has one flat list of tools, so a name can be published once.`,
		);
	}
}
