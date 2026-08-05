# @nestjs-adk/mcp

MCP tools for [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core) agents.

The [Model Context Protocol](https://modelcontextprotocol.io) is an open standard that exposes tools from external servers, like GitHub, filesystems or your own services. This package connects your NestJS agents to those servers. The server's catalog becomes agent tools automatically, each keeping the JSON Schema exactly as the server published it.

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

## Servers your users connect themselves

Everything above assumes the servers belong to the application. When each user connects their own integrations, the set is only known at runtime, and `AdkMcpServer` is a per-run tool source instead of boot configuration.

```ts
const run = await this.assistant.ask({
	message,
	sources: rows.map((row) => new AdkMcpServer({
		id: row.id,
		name: row.name,               // becomes the prefix: mcp__<name>__<tool>
		transport: { type: "http", url: row.url },
		auth: new BearerAuth(row.token),
	})),
});
```

Persistence is yours. The library never stores a credential and has no opinion about your schema; it connects with what you hand it and closes when the run ends.

Because this URL comes from an end user, it is guarded before anything connects. Private, loopback and link-local addresses are refused (the hostname is resolved and every answer checked), and a public server must speak https, or the user's credential would travel in the clear. The guard also rides into the connection as its fetch, so a redirect to an internal address is refused too. A blocked target is logged as an error and the run continues without that source. When the server really is on your own network (a local dev server, an internal corporate MCP), opt in explicitly with `allowPrivateNetwork: true`; the flag widens the network, never the https rule for public targets. `McpModule.forRoot` has no guard: that URL is the developer's own code. Known limit: DNS rebinding is not covered yet.

The OAuth helpers (`McpOAuth.discover`, `register`, `exchange`) run through the same guard, and accept the same `allowPrivateNetwork` option, because the endpoints they talk to come from the server's own metadata.

Every MCP tool carries an `effect` (`read`, `write` or `destructive`), derived from the server's annotations: `readOnlyHint: true` is `read`, `destructiveHint: false` is `write`, and anything else, including no annotations, is `destructive`, following the spec's own defaults. Under the default approval policy a `destructive` tool pauses the run for a human decision (see the core documentation on human approval). Annotations are written by the server, so they are untrusted input; pass `trustAnnotations: false` to ignore one server's annotations and treat every tool from it as `destructive`.

A "catalogue" is just a folder of subclasses:

```ts
export class ClickupMcpServer extends AdkMcpServer {
	constructor(options: { id?: string; auth: AdkMcpAuth; tools?: string[] }) {
		super({ name: "clickup", transport: { type: "http", url: "https://mcp.clickup.com/mcp" }, ...options });
	}
}
```

Instantiating a subclass and instantiating the base with a URL that came from a form are the same code path, which is why there is no separate mode for one or the other.

### Authentication

Renewal is a property of the method, not a setting: a static token has nothing to renew, OAuth does.

```ts
new BearerAuth(token)                     // Authorization: Bearer
new HeaderAuth({ "X-Api-Key": key })      // any other header
new EnvAuth({ GITHUB_TOKEN: token })      // stdio, as environment
new OAuthAuth({ tokens, client, onRefresh })
```

`OAuthAuth` renews an expired token before connecting and hands the new one to `onRefresh`. **Provide it.** Without it the renewal happens and is discarded, so the next run reads the old token again, and a provider that rotates refresh tokens breaks the connection for good. When renewal is impossible the source reports `reauth` instead of failing as if the server were down.

For `stdio`, the child process gets the SDK's safe environment subset plus what you passed. It never inherits your full `process.env`: a server the user configured has no business seeing your LLM provider key or your database URL.

### Getting the tokens

The authorization flow is HTTP with your routes and your session, so it stays in your application. What the specification fixes lives here, so nobody reimplements discovery per integration:

```ts
const discovery = await McpOAuth.discover(serverUrl);
const client = await McpOAuth.register(discovery, { redirectUri, clientName: "My App" });
const { url, verifier, state } = McpOAuth.authorize(discovery, client, { redirectUri });
// store verifier and state against the session, then redirect to `url`

// in the callback
const tokens = await McpOAuth.exchange(client, { code, verifier, redirectUri, resource: discovery.resource });
```

PKCE and `state` are generated for you. Discovery refuses an authorization server that is not on `https`, and refuses metadata claiming an issuer other than the one asked about: a server can nominate its own authorization server, so that document is untrusted input. The `resource` binds the token to the server it was issued for.

### What to expect

Tools are exposed as `mcp__<name>__<tool>`, the same shape Claude Code and Cursor use, so an external tool is recognizable next to your own. The name is yours to choose and must be unique within a run, which is what lets the same product be connected twice under different accounts.

A server that is down leaves its tools out and the conversation continues. A tool whose name the provider would reject is skipped with a warning rather than taking the whole request down. And one instance serves one run: reuse it concurrently and the second run is refused, so it cannot disconnect the first.

## Learn more

The full documentation lives in [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core) and in the repository at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).
