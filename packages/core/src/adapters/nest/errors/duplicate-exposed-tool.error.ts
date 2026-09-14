import { AdkError } from "../../../common/errors/adk.error";

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
