import { AdkError } from "@nestjs-adk/core";

/**
 * Thrown from `McpActorResolver.resolve` when a request carries no usable identity. `challenge`
 * is returned as `WWW-Authenticate`, which is how an MCP client finds out where to send a person
 * to authorize.
 */
export class McpUnauthorizedError extends AdkError {
	public readonly code = "MCP_UNAUTHORIZED";

	public constructor(
		public readonly reason: string,
		public readonly challenge?: string,
	) {
		super(`MCP request refused: ${reason}`);
	}
}
