import { ToolEffect } from "@nestjs-adk/core";

/**
 * The tool's effect as an MCP client reads it. The inverse of what the client side does with a
 * server's hints, and equally conservative: `write` is neither read-only nor destructive, so a
 * client that asks before destructive calls asks about exactly what the author marked.
 */
export class McpToolAnnotations {
	private constructor(
		public readonly readOnlyHint: boolean,
		public readonly destructiveHint: boolean,
	) {
		Object.freeze(this);
	}

	public static fromEffect(effect: ToolEffect): McpToolAnnotations {
		return new McpToolAnnotations(effect.equals(ToolEffect.READ), effect.equals(ToolEffect.DESTRUCTIVE));
	}

	public toJSON(): { readOnlyHint: boolean; destructiveHint: boolean } {
		return { readOnlyHint: this.readOnlyHint, destructiveHint: this.destructiveHint };
	}
}
