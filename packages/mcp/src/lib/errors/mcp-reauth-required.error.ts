import { AdkError } from "@nestjs-adk/core";

/**
 * The credential is gone and only the person who granted it can produce another one.
 *
 * This is the terminal end of renewal: the refresh token was revoked, rotated away or never
 * existed. `AdkMcpServer` turns it into `ToolSourceAuthError`, so the run continues without this
 * source and the application has something to show next to the integration.
 */
export class McpReauthRequiredError extends AdkError {
	public readonly code = "MCP_REAUTH_REQUIRED";

	public constructor(public readonly reason: string) {
		super(reason);
	}
}
