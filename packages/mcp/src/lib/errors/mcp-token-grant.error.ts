import { AdkError } from "@nestjs-adk/core";

export type McpGrantRejection = "transient" | "reauth-required" | "invalid-request";

/**
 * A token endpoint refused an exchange, a renewal or a revocation. `rejection` is the fact to
 * act on: `transient` revoked nothing and will likely work next run, `reauth-required` means the
 * user has to authorize again, and `invalid-request` is the client's own mistake.
 */
export class McpTokenGrantError extends AdkError {
	public readonly code = "MCP_TOKEN_GRANT_FAILED";

	public constructor(
		public readonly endpoint: string,
		public readonly rejection: McpGrantRejection,
		public readonly reason: string,
		public readonly status?: number,
		public readonly oauthError?: string,
		options?: ErrorOptions,
	) {
		super(`Token request to "${endpoint}" failed: ${reason}`, options);
	}

	public get isTransient(): boolean {
		return this.rejection === "transient";
	}
}
