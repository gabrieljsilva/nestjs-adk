import { AdkError } from "@nestjs-adk/core";

/**
 * A source name that cannot become a tool name the provider will accept.
 *
 * It is raised while the source is constructed, not when the run starts: a name is data the
 * application already holds, and a provider refusing the declaration takes down every tool of
 * the turn, not just this integration's.
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
