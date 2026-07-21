import type { ResolvedTool } from "./resolved-agent";

/**
 * Reference to a set of tools provided by an external source.
 * Used in `@Agent({ tools: [...] })` alongside AdkTool classes.
 * @nestjs-adk/mcp exposes `mcpTools()` as sugar over `toolset()`.
 */
export interface ToolsetRef {
	readonly __adkToolset: string;
	/** No filter: every tool in the set. */
	filter?: string[];
}

export function toolset(name: string, filter?: string[]): ToolsetRef {
	return { __adkToolset: name, filter };
}

export function isToolsetRef(value: unknown): value is ToolsetRef {
	return typeof value === "object" && value !== null && "__adkToolset" in value;
}

/**
 * Toolset resolution contract (implemented by @nestjs-adk/mcp).
 * Must be provided by a @Global module exporting this token.
 */
export abstract class ToolsetResolver {
	public abstract resolve(ref: ToolsetRef): Promise<ResolvedTool[]>;
}
