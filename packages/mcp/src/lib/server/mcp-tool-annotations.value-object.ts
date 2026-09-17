import { ToolEffect } from "@nestjs-adk/core";

/**
 * A tool's effect as an MCP client reads it, published as `readOnlyHint` and `destructiveHint`.
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
