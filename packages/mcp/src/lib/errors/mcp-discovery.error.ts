import { AdkError } from "@nestjs-adk/core";

/**
 * The server could not be asked how to authorize against it, or it answered something unusable.
 *
 * Covers the whole preamble of the flow: the well-known documents, the issuer check and dynamic
 * registration. It does not cover the token endpoint refusing a grant, which is
 * `McpTokenGrantError`: one says the integration cannot be set up, the other says this attempt
 * failed, and an application acts differently on each.
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
