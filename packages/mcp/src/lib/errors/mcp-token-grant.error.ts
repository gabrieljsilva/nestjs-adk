import { AdkError } from "@nestjs-adk/core";

/** How a token endpoint refused, once the status and the OAuth error code are read together. */
export type McpGrantRejection = "transient" | "reauth-required" | "invalid-request";

/**
 * A token endpoint refused a grant: an authorization code exchange, a renewal or a revocation.
 *
 * `rejection` is the fact worth acting on. A provider answering 429 or 502 rejected nothing about
 * the credential, and an application that marks the integration as disconnected on every refusal
 * asks the user to sign in again because the provider had a bad minute. Only
 * `"reauth-required"` means the credential itself is finished.
 */
export class McpTokenGrantError extends AdkError {
	public readonly code = "MCP_TOKEN_GRANT_FAILED";

	public constructor(
		public readonly endpoint: string,
		public readonly rejection: McpGrantRejection,
		public readonly reason: string,
		/** Absent when the request never reached the provider. */
		public readonly status?: number,
		/** The `error` field of the OAuth response, when the provider sent one. */
		public readonly oauthError?: string,
		options?: ErrorOptions,
	) {
		super(`Token request to "${endpoint}" failed: ${reason}`, options);
	}

	/** The same request, sent again later, may well succeed. */
	public get isTransient(): boolean {
		return this.rejection === "transient";
	}
}
