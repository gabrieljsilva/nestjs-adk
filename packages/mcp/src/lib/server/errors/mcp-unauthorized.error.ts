import { AdkError } from "@nestjs-adk/core";

/**
 * Thrown by an actor resolver when the request carries no credential it accepts.
 *
 * `challenge` is what the endpoint writes into `WWW-Authenticate`, and for a server behind
 * OAuth it is the line an MCP client follows to find out where to send a person to authorize:
 * `Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"`.
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
