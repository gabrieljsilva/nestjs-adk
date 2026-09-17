import { AdkError } from "@nestjs-adk/core";

/**
 * The server did not say how users are authorized with it. This is a configuration answer rather
 * than something to retry: there is nowhere to send the user.
 */
export class McpDiscoveryError extends AdkError {
	public readonly code = "MCP_DISCOVERY_FAILED";

	public constructor(
		public readonly target: string,
		public readonly reason: string,
	) {
		super(`Could not discover how to authorize with "${target}": ${reason}`);
	}
}
