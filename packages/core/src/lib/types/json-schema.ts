import type { AnyZodObject } from "./options";

/**
 * A JSON Schema object as an external catalog (an MCP server) publishes it. The lib does not
 * interpret it beyond the shape below; whatever else the server wrote travels with it and each
 * engine decides what its provider understands. See `ToolSchema` on `ResolvedTool`.
 */
export interface JsonSchema {
	type?: string | string[];
	description?: string;
	properties?: Record<string, JsonSchema>;
	required?: string[];
	items?: JsonSchema | JsonSchema[];
	enum?: unknown[];
	additionalProperties?: boolean | JsonSchema;
	[keyword: string]: unknown;
}

/**
 * The two shapes a tool schema can have. Declared (`@Tool`) tools carry Zod, which is the dev's
 * own contract and validates for real. Tools from an external catalog carry the JSON Schema the
 * server published, untranslated: the server owns that contract and validates on its side, so a
 * lossy conversion here would only subtract information from the model.
 */
export type ToolSchema = AnyZodObject | JsonSchema;

/**
 * Distinguishes the two arms of `ToolSchema`. Zod instances expose `safeParse`; a JSON Schema is
 * plain data. Checking for the method instead of `instanceof` keeps the guard working across
 * duplicated zod installs, which a monorepo consumer will eventually have.
 */
export function isJsonSchema(schema: ToolSchema): schema is JsonSchema {
	return typeof (schema as { safeParse?: unknown }).safeParse !== "function";
}

/**
 * The strip for JSON Schema tools, without Zod: a key the model invented must not reach a
 * third-party system that has tenancy of its own. Only the top level is pruned, and only when the
 * schema encloses itself (declared `properties`, `additionalProperties` not open): a schema that
 * accepts a free-form payload keeps it whole. Stripping never costs correctness, only safety.
 */
export function pruneByProperties(input: unknown, schema: JsonSchema): unknown {
	if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
	const { properties, additionalProperties } = schema;
	if (!properties || additionalProperties === true || typeof additionalProperties === "object") return input;
	return Object.fromEntries(Object.entries(input).filter(([key]) => key in properties));
}
