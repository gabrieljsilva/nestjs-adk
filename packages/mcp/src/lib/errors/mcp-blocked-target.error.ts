import { AdkError } from "@nestjs-adk/core";

/**
 * The SSRF guard refused a target: a private, loopback or link-local address, or a public server
 * over cleartext. `allowPrivateNetwork` is what allows the first case deliberately.
 */
export class McpBlockedTargetError extends AdkError {
	public readonly code = "MCP_BLOCKED_TARGET";

	public constructor(
		public readonly url: string,
		reason: string,
	) {
		super(`Refusing to connect to "${url}": ${reason}`);
	}
}
