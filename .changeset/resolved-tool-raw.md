---
"@nestjs-adk/core": minor
"@nestjs-adk/mcp": minor
---

`ResolvedTool.raw` keeps the declaration the source sent, untouched.

A tool from an external catalog used to lose the original declaration in the Zod conversion: the JSON Schema the MCP server published, its annotations, everything the server actually said. A permissions UI needs that to show what a tool accepts before the user enables it, and converting the Zod schema back would rebuild with loss what the lib had in hand. Same principle as `RawRef` on events: nothing is discarded.

`AdkMcpServer` and `McpClient` fill it with the SDK's tool object, by reference. It is display data and untrusted input, the server wrote it: never validate with it, rebuild a tool from it, or branch on it at runtime; the Zod `schema` remains the one contract that guards execution. Declared (`@Tool`) tools have no `raw`, because nothing was converted and the schema is the original declaration.
