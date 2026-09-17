import { AdkError } from "@nestjs-adk/core";

/**
 * Only the user can fix this credential: the refresh token was revoked, rotated away or never
 * existed. Throw it from `AdkMcpAuth.resolve` and the run records a reauth event naming the
 * source and carries on with fewer tools, instead of failing.
 */
export class McpReauthRequiredError extends AdkError {
	public readonly code = "MCP_REAUTH_REQUIRED";

	public constructor(public readonly reason: string) {
		super(reason);
	}
}
