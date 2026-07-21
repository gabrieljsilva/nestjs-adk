# @nestjs-adk/mcp

Consume external MCP servers as agent tools for [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core), via the official `@modelcontextprotocol/sdk` (stdio, streamable HTTP, SSE).

```ts
McpModule.forRoot({ servers: [{ name: "github", transport: { type: "stdio", command: "npx", args: [...] } }] })

@Agent({ ..., tools: [toolset("github", ["create_issue"])] }) // the server's catalog becomes tools (JSON Schema → Zod)
```

The catalog is cached at boot (fail-fast; `optional: true` for non-critical servers). Runtime tool failures return as `{ error }` to the LLM; connection errors become typed `McpConnectionError`s.

Full documentation: [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk)
