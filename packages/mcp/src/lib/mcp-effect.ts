import type { ToolEffect } from "@nestjs-adk/core";

/** The slice of MCP tool annotations the effect mapping reads. */
export interface McpToolAnnotations {
	readOnlyHint?: boolean;
	destructiveHint?: boolean;
}

/**
 * MCP annotations to the lib's effect scale, one mapping in one place. The spec's own defaults
 * (`readOnlyHint: false`, `destructiveHint: true`) apply when the server says nothing, so an
 * unannotated tool lands on `destructive`: it is a third-party server, and the benefit of the
 * doubt is not ours to give.
 */
export function effectOf(annotations: McpToolAnnotations | undefined): ToolEffect {
	if (annotations?.readOnlyHint === true) return "read";
	if (annotations?.destructiveHint === false) return "write";
	return "destructive";
}
