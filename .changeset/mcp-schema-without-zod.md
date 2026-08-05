---
"@nestjs-adk/core": major
"@nestjs-adk/mcp": major
"@nestjs-adk/google": major
---

MCP tools keep the JSON Schema the server published; the Zod conversion is gone.

The round trip made no sense: the server publishes JSON Schema, the provider consumes something very close to JSON Schema, and the Zod in between could only subtract. Measured against the live Gemini API, the converter was destroying constructs the provider accepts as they are (`anyOf`, `oneOf`, `format`, `pattern`, `minLength` and more), all silently, and a server shipping `{"type": "array"}` produced a declaration Gemini refuses with a 400 that takes down every tool of the turn.

## Breaking: `ResolvedTool.schema` is now `ToolSchema`

`ToolSchema = AnyZodObject | JsonSchema`. Declared (`@Tool`) tools keep Zod, which is the dev's own contract and still validates every call. Tools from an external catalog (MCP) carry the server's `inputSchema` untouched: the server owns that contract and validates on its side. `isJsonSchema()` tells the two arms apart; `jsonSchemaToZod` no longer exists.

Consequences for external tools:

- Local argument validation is gone, so `maxInvalidArgs` no longer counts for them; a bad argument comes back from the server as a tool error the model can react to.
- The strip survives without Zod: `pruneByProperties()` drops top-level keys the model invented before they reach a third-party system, unless the schema declares itself open (`additionalProperties`). The HITL approval snapshot therefore still holds clean arguments.
- `raw` still carries the SDK's whole tool object (annotations included) for permissions UIs.

## The engine filters, it does not translate

`@nestjs-adk/google` hands the model the server's schema filtered to Gemini's declaration surface (`toGeminiSchema()`, exported). It is an allowlist measured against the live API: everything Gemini accepts survives verbatim, an unknown keyword loses itself instead of the turn. Three repairs proved necessary: `$ref` is inlined from `$defs`/`definitions` (with a depth cap for recursive schemas), `type: ["string", "null"]` becomes `type` plus `nullable`, and an array without usable `items` gains `items: {type: "string"}`, which is the bug that started this. The input is never mutated.
