# @nestjs-adk/mcp

Consumo de MCP servers externos como tools de agentes do [nestjs-adk](../../README.md), via `@modelcontextprotocol/sdk` oficial (stdio, HTTP streamable, SSE).

```ts
McpModule.forRoot({ servers: [{ name: "github", transport: { type: "stdio", command: "npx", args: [...] } }] })

@Agent({ ..., tools: [mcpTools("github", ["create_issue"])] })
```

Catálogo cacheado no boot (fail-fast; `optional: true` para servers não-críticos). Falhas de tool em runtime voltam como `{ error }` para o LLM.
