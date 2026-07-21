# @nestjs-adk/mcp

MCP tools for [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core) agents.

The [Model Context Protocol](https://modelcontextprotocol.io) is an open standard that exposes tools from external servers, like GitHub, filesystems or your own services. This package connects your NestJS agents to those servers. The server's catalog becomes agent tools automatically, with each JSON Schema converted to Zod.

## Setup

```bash
npm i @nestjs-adk/core @nestjs-adk/mcp
```

Register the servers once:

```ts
import { McpModule } from "@nestjs-adk/mcp";

@Module({
	imports: [
		AdkModule.forRoot({ ... }),
		McpModule.forRoot({
			servers: [
				{ name: "github", transport: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] } },
			],
		}),
	],
})
export class AppModule {}
```

Transports are `stdio` for local processes, `http` for streamable HTTP servers and `sse` for legacy SSE servers.

## Giving the tools to an agent

Use `toolset` in the agent's tool list. You can expose the whole catalog or pick specific tools:

```ts
import { toolset } from "@nestjs-adk/core";

@Agent({
	name: "dev_assistant",
	description: "Helps with repository tasks.",
	prompt: "You help the team manage GitHub issues.",
	tools: [toolset("github", ["create_issue", "list_issues"])],
})
export class DevAssistantAgent extends AdkAgent {}
```

Omit the second argument to expose every tool the server offers.

## Behavior you can rely on

The catalog is fetched once at startup and cached. If a server is down at boot the app fails fast with a typed `McpConnectionError`, unless you mark that server with `optional: true`, in which case it is skipped with a warning.

At runtime, a tool call that fails on the server side does not crash the run. The error is returned to the model as `{ error }`, so the agent can react, retry or explain the problem to the user.

## Learn more

The full documentation lives in [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core) and in the repository at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).
