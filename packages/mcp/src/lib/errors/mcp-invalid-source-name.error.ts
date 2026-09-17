import { AdkError } from "@nestjs-adk/core";

/**
 * Thrown from the `AdkMcpServer` constructor for a name a provider would refuse: letters,
 * digits, `_` and `-`, at most 47 characters. It is raised before any connection is attempted,
 * because a declaration a provider refuses takes down every tool of the turn.
 */
export class McpInvalidSourceNameError extends AdkError {
	public readonly code = "MCP_INVALID_SOURCE_NAME";

	public constructor(
		public readonly sourceName: string,
		reason: string,
	) {
		super(`Invalid MCP source name "${sourceName}": ${reason}`);
	}
}
