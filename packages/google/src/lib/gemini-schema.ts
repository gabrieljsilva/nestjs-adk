import type { JsonSchema } from "@nestjs-adk/core";

/**
 * Keywords the Gemini function-declaration surface accepts, measured against the live API plus the
 * fields of `Schema` in `@google/genai`. This is an ALLOWLIST on purpose: the declaration travels in
 * one request with every tool of the turn, and one unknown keyword answers 400 for all of them. A
 * blocklist fails open on the first keyword nobody probed; dropping an unknown keyword only loses an
 * annotation.
 */
const GEMINI_KEYWORDS = new Set([
	"type",
	"format",
	"title",
	"description",
	"nullable",
	"default",
	"items",
	"minItems",
	"maxItems",
	"enum",
	"properties",
	"required",
	"minProperties",
	"maxProperties",
	"minimum",
	"maximum",
	"minLength",
	"maxLength",
	"pattern",
	"example",
	"anyOf",
	"oneOf",
	"allOf",
	"not",
	"propertyOrdering",
]);

/** Keywords whose value is a schema (or a list of schemas) and must be sanitized recursively. */
const SCHEMA_VALUED = new Set(["items", "properties", "anyOf", "oneOf", "allOf", "not"]);

/**
 * `$ref` chains and recursive schemas stop here. Past the cap the reference degrades to `{}` at
 * that point, which loses the constraint but keeps the declaration, and with it the turn.
 */
const MAX_REF_DEPTH = 16;

/**
 * Filters a JSON Schema (as an MCP server published it) down to what Gemini's declaration surface
 * understands. A filter, not a translator: everything in the allowlist survives verbatim, including
 * `anyOf`, `format`, `pattern` and lowercase types, which the API accepts as they are. Three repairs
 * the API measurements proved necessary:
 *
 * - `$ref` is inlined from the root's `$defs`/`definitions` (Gemini rejects the keyword, and
 *   dropping it would leave the property with no type at all).
 * - `type: ["string", "null"]` becomes `type: "string"` plus `nullable: true`.
 * - An array with no usable `items` gains `items: {type: "string"}`: the API refuses an ARRAY
 *   without items, and one server shipping `{"type": "array"}` must not end the conversation.
 *
 * Always returns a fresh object; the input is the server's declaration (`ResolvedTool.raw` points
 * at it) and is never mutated.
 */
export function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
	const root = sanitize(schema, schema, 0);
	// The declaration slot is an OBJECT parameter list; a root that says nothing else is one.
	if (root.type === undefined) root.type = "object";
	return root;
}

function sanitize(node: JsonSchema, root: JsonSchema, depth: number): Record<string, unknown> {
	// Depth counts inlined references along this path, not plain nesting: a recursive schema
	// (a $def reaching itself through properties) has no finite expansion and must stop somewhere.
	let current = node;
	let refs = depth;
	while (typeof current.$ref === "string") {
		if (refs++ >= MAX_REF_DEPTH) return {};
		const resolved = resolveRef(current.$ref, root);
		if (!resolved) return {};
		current = resolved;
	}

	const out: Record<string, unknown> = {};
	for (const [keyword, value] of Object.entries(current)) {
		if (!GEMINI_KEYWORDS.has(keyword) || value === undefined) continue;
		out[keyword] = SCHEMA_VALUED.has(keyword) ? sanitizeValue(keyword, value, root, refs) : value;
	}

	if (Array.isArray(out.type)) {
		const types = out.type.filter((entry) => entry !== "null");
		if (out.type.length > types.length) out.nullable = true;
		out.type = types[0]; // a true multi-type union has no Gemini form; the first arm is the best left
	}

	if (out.type === "array" && !describesElement(out.items)) out.items = { type: "string" };

	return out;
}

function sanitizeValue(keyword: string, value: unknown, root: JsonSchema, depth: number): unknown {
	if (keyword === "properties") {
		const properties = value as Record<string, JsonSchema>;
		return Object.fromEntries(Object.entries(properties).map(([name, prop]) => [name, sanitize(prop, root, depth)]));
	}
	// JSON Schema's tuple form for items has no Gemini equivalent; the first element schema is kept.
	if (keyword === "items") return sanitize((Array.isArray(value) ? value[0] : value) as JsonSchema, root, depth);
	if (Array.isArray(value)) return value.map((entry) => sanitize(entry as JsonSchema, root, depth));
	return sanitize(value as JsonSchema, root, depth);
}

/** Looks a `$ref` up in the root's `$defs`/`definitions`. External or unknown pointers resolve to nothing. */
function resolveRef(ref: string, root: JsonSchema): JsonSchema | undefined {
	const match = ref.match(/^#\/(\$defs|definitions)\/(.+)$/);
	const [, section, name] = match ?? [];
	if (!section || !name) return undefined;
	const definitions = root[section] as Record<string, JsonSchema> | undefined;
	return definitions?.[name];
}

/**
 * Whether an `items` schema says anything Gemini can use. An element that is `{}` (or that lost all
 * its keywords in sanitization) leaves the ARRAY without items, which the API refuses.
 */
function describesElement(items: unknown): boolean {
	return typeof items === "object" && items !== null && Object.keys(items).length > 0;
}
