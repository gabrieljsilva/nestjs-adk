---
"@nestjs-adk/core": major
"@nestjs-adk/mcp": major
"@nestjs-adk/google": major
---

Tools that belong to your user, not to your configuration: a source opened per run, guarded against your own network, and gated by what a tool does.

MCP support so far assumed the servers were the application's: declared in `McpModule.forRoot()`, connected at boot, identical for everyone. That leaves out the product most agent applications are actually building, where each end user connects their own integrations and the agent operates with that person's credentials.

## Tool sources

The core gains one concept, `ToolSource`: a set of tools with a lifetime, handed to a single run.

```ts
const run = await this.assistant.ask(message, {
	sessionId,
	sources: await this.integrationsOf(user.id),
});
```

Sources are opened while the agent is resolved and closed when the run ends, whether it succeeded, threw, or the consumer walked away from the stream. Their tools join the ones the agent declares and are indistinguishable downstream: validation, offload, approvals and events all apply. A `@Tool()` class stays out of the contract on purpose, since it resolves through DI, cannot fail to open, and has nothing to shut down.

Two failures are expected and neither ends the run. `ToolSourceUnavailableError` leaves that source's tools out and the conversation continues. `ToolSourceAuthError` journals a `tool.source-reauth-required` event naming the source, which is what an application turns into a reconnect button. The distinction is the point: reconnecting fixes one and not the other, and hiding the tool entirely would leave the agent unable to explain why it suddenly cannot do something. Duplicate source names fail before any connection is attempted, and omitting `sources` costs you tools rather than giving you someone else's. An approval declares them again, because the run that suspended closed its own.

## Breaking: MCP servers are instances, not module configuration

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

`optional` has no replacement because it is no longer a choice: a server that will not start leaves its tools out and the run answers with the rest, which is what `optional: true` used to buy. There is also no longer a boot connection: a source opens per run and closes with it, so a server the module declares is dialed when someone asks something and never held open by a process that is idle.

The tool name changed. The model used to be offered the server's own name, `create_issue`, so two servers exposing the same tool collided and neither the model nor a log line could say which server answered. It is now `mcp__github__create_issue`, the same shape Claude Code and Cursor use, which means a prompt that names a tool literally has to be updated. A `stdio` child process receives the SDK's safe environment subset plus what you passed, never the full `process.env`: a server the user configured has no business reading your provider keys.

## Breaking: a user-supplied URL can no longer reach your own network

`AdkMcpServer` exists so end users connect their own servers, which means its URL is untrusted input. Until now, `http://169.254.169.254/latest/meta-data/` pasted into a form connected from inside your network, with your egress. Now every address is checked before the connection: private, loopback and link-local addresses are refused (the hostname is resolved and every answer is checked, so `localhost`, `127.0.0.1` and a DNS name pointing at either are the same case), and so are public servers over plain http, because the user's credential would travel in the clear. Refusal is logged as an error and surfaces as `ToolSourceUnavailableError` carrying a `McpBlockedTargetError` cause: the run survives, the operator sees why.

`McpOAuth.discover`, `register` and `exchange` run their requests through the same guard, not only the first hop: the endpoints later calls POST to came from the server's own metadata, which is the same problem with one extra step. Native fetch follows redirects on its own, and a public URL answering 302 to an internal address is the classic way around a check that only looks at the first URL, so the guard rides into the SDK transports as their `fetch`, follows redirects manually and re-validates every hop, giving up after five. Known limit: the connection still dials the hostname, so a name that answers differently on the second query is not covered yet.

When the server really belongs to the operator's network, say so explicitly. The flag widens the network, not the protocol: http becomes acceptable for private targets, and a public server still must speak https.

```ts
new AdkMcpServer({ name, transport, allowPrivateNetwork: true });
await McpOAuth.discover(url, { allowPrivateNetwork: true });
```

`McpBlockedTargetError` (`code: "MCP_BLOCKED_TARGET"`) joins the core taxonomy as a refusal rather than an availability problem, `McpDiscoveryError` now extends `AdkError` with `code: "MCP_DISCOVERY_FAILED"`, and `assertSafeTarget(url, trust)` and `guardedFetch(trust)` are exported for applications that fetch user-supplied URLs around the same flow.

## Breaking: tools declare what they do, policy decides what pauses

Approval used to be a per-tool flag, which mixed two questions with two different owners: what the tool does to the world (the author knows) and what to do about it (only the caller knows). The flag also never reached MCP tools, so a connected server could delete an issue with no pause at all.

`@Tool({ requiresApproval })` is gone. Declare `effect: "read" | "write" | "destructive"` instead; unset means `write`, and `destructive` means "not recoverable through the same API": deleting, but also sending an email or charging a card. The predicate form has no replacement, since the policy is per run and not per argument. `EffectApprovalPolicy` maps effect to requirement and is declared on the runtime or per call, reading `effect` on the resolved tool and nothing else, so a decorated class and an MCP tool pause under the same rule.

The gate now covers every tool the model can call. A source tool without an `effect` counts as `destructive` and pauses under the default policy: a third-party server gets no benefit of the doubt. `@nestjs-adk/mcp` derives `effect` from the spec's tool annotations (`readOnlyHint: true` is `read`, `destructiveHint: false` is `write`, anything else including no annotations is `destructive`, which follows the spec's own defaults), and since annotations are written by the server, `trustAnnotations: false` ignores them and treats every tool from that server as destructive.

`approve()` resumes a paused source tool. Pass `sources` again, the same way `ask()` received them: the library keeps no credentials and the original connection is closed, so whoever resumes reopens the source. The approved call runs without the gate, and the resumed turn is a new run, so a fresh call of the same tool pauses again.

## Breaking: an MCP tool keeps the schema its server published

The round trip made no sense: the server publishes JSON Schema, the provider consumes something very close to JSON Schema, and the Zod in between could only subtract. Measured against the live Gemini API, the converter was destroying constructs the provider accepts as they are (`anyOf`, `oneOf`, `format`, `pattern`, `minLength` and more), all silently, and a server shipping `{"type": "array"}` produced a declaration Gemini refuses with a 400 that takes down every tool of the turn.

A tool schema is now either arm: declared (`@Tool`) tools keep Zod, which is the developer's own contract and still validates every call, while tools from an external catalog carry the server's `inputSchema` untouched, since the server owns that contract and validates on its side. Local argument validation is therefore gone for external tools, and a bad argument comes back from the server as a tool error the model can react to.

`@nestjs-adk/google` hands the model the server's schema filtered to Gemini's declaration surface. It is an allowlist measured against the live API: everything Gemini accepts survives verbatim, and an unknown keyword loses itself instead of losing the turn. Three repairs proved necessary: `$ref` is inlined from `$defs`/`definitions` with a depth cap for recursive schemas, `type: ["string", "null"]` becomes `type` plus `nullable`, and an array without usable `items` gains `items: {type: "string"}`, which is the bug that started this. The input is never mutated.

## Also

`explain()` opens and closes sources too, so a dry run describes the context that would actually be sent instead of one missing its tool declarations. Attachment content is fenced and labelled as data before entering the request, so a file that says "ignore your instructions" no longer arrives with the authority of the person who asked.
