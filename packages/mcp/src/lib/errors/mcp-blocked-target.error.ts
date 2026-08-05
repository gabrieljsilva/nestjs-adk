import { AdkError } from "@nestjs-adk/core/native";

/**
 * A connection was refused before it was attempted.
 *
 * The address came from configuration a developer wrote, and an MCP server pointed at a
 * loopback or a private range is how an integration becomes a way to reach the inside of
 * the network it runs in. It lives in this package because only this package connects to
 * one: the runtime has no opinion about addresses.
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
