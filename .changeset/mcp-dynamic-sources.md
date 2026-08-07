---
"@nestjs-adk/core": major
"@nestjs-adk/mcp": major
---

Tools that belong to your user, not to your configuration.

MCP support so far assumed the servers were the application's: declared in `McpModule.forRoot()`, connected at boot, identical for everyone. That leaves out the product most agent applications are actually building, where each end user connects their own integrations and the agent operates with that person's credentials.

## Tool sources

The core gains one concept, `ToolSource`: a set of tools with a lifetime, handed to a single run.

```ts
const run = await this.assistant.ask(message, {
	sessionId,
	sources: await this.integrationsOf(user.id),
});
```

Sources are opened while the agent is resolved and closed when the run ends, whether it succeeded, threw, or the consumer walked away from the stream. Their tools join the ones the agent declares and are indistinguishable downstream: argument validation, offload, approvals and events all apply.

`ResolvedTool` already unified what the model can call, which is why none of that needed new code. What had no home was the thing that *produces* tools when it has a connection to open and close. A `@Tool()` class stays out of the contract on purpose: it resolves through DI, cannot fail to open, and has nothing to shut down.

Two failures are expected and neither ends the run. `ToolSourceUnavailableError` leaves that source's tools out and the conversation continues. `ToolSourceAuthError` journals a `tool.source-reauth-required` event naming the source, which is what an application turns into a reconnect button. The distinction is the point: reconnecting fixes one and not the other, and hiding the tool entirely would leave the agent unable to explain why it suddenly cannot do something.

Duplicate source names fail before any connection is attempted. `sources` is optional, and omitting it costs you tools rather than giving you someone else's.

## MCP servers per run

`@nestjs-adk/mcp` implements the contract. A server is now an instance:

```ts
new AdkMcpServer({
	id: row.id,
	name: row.name,                                    // tools become mcp__<name>__<tool>
	transport: { type: "http", url: row.url },
	auth: new OAuthAuth({ tokens, client, onRefresh }),
})
```

Persistence stays yours: the library stores no credential and has no opinion about your schema. A curated catalogue is a folder of subclasses, and a URL typed into a form is the same code path, so there is no separate mode for either.

Authentication is a contract rather than a flag, because renewal is a property of the method: `BearerAuth`, `HeaderAuth`, `EnvAuth` and `OAuthAuth`. The last one renews before connecting and returns the new tokens through `onRefresh`: supply it, or the renewal is discarded and a provider that rotates refresh tokens breaks on the following run. Concurrent sources share one in-flight renewal instead of racing.

`McpOAuth` covers the parts the specification fixes: discovery, dynamic registration, PKCE authorization and code exchange. Routes and session storage stay in your application, since they are its concerns. Discovery refuses an authorization server that is not on `https` and refuses metadata claiming an issuer other than the one asked about, because a server nominating its own authorization server is untrusted input; tokens are bound to the resource they were issued for.

Tools are prefixed `mcp__<name>__`, the same shape Claude Code and Cursor use. A `stdio` child process receives the SDK's safe environment subset plus what you passed, never the full `process.env`: a server the user configured has no business reading your provider keys.

## Migrating from the module

`McpModule`, `McpClient`, `mcpTools()`, `toolset()` and `jsonSchemaToZod()` are gone. A server the application owns is the same instance as one a user owns, declared on the module instead of on the call:

```ts
// before
McpModule.forRoot({ servers: [{ name: "github", transport, optional: true }] });
@Agent({ tools: [mcpTools("github", ["create_issue"])] })

// after
AdkModule.forRoot(
	AdkModuleOptions.from({
		defaultModel,
		runtime: RuntimeOptions.from({
			sources: [new AdkMcpServer({ name: "github", transport, tools: ["create_issue"] })],
		}),
	}),
);
```

`optional` has no replacement because it is no longer a choice: a server that will not start leaves its tools out and the run answers with the rest, which is what `optional: true` used to buy. There is also no longer a boot connection. A source opens per run and closes with it, so a server the module declares is dialed when someone asks something and never held open by a process that is idle.

Two consequences worth naming. The tool name changed: the model used to be offered the server's own name, `create_issue`, so two servers exposing the same tool collided and neither the model nor a log line could say which server answered. It is now `mcp__github__create_issue`, which means a prompt that names a tool literally has to be updated. And the target guard applies to module sources as well, so an internal server on a private address now needs `allowPrivateNetwork: true`.

## Also

`AgentRunner.explain()` opens and closes sources too, so a dry run describes the context that would actually be sent instead of one missing its tool declarations. Attachment content is now fenced and labelled as data before entering the request, so a file that says "ignore your instructions" no longer arrives with the authority of the person who asked.
