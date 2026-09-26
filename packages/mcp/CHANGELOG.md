# @nestjs-adk/mcp

## 2.0.0

### Major Changes

- d00a048: Tools that belong to your user, not to your configuration: a source opened per run, guarded against your own network, and gated by what a tool does.

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
    name: row.name, // tools become mcp__<name>__<tool>
    transport: { type: "http", url: row.url },
    auth: new OAuthAuth({ tokens, client, onRefresh }),
  });
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
  			tools: { sources: [new AdkMcpServer({ name: "github", transport, tools: ["create_issue"] })] },
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

- 4591e24: A name says what it does.

  Every file now declares its category in its suffix (`session-storage.contract.ts`, `ask-agent.use-case.ts`, `agent-name.value-object.ts`), and a spec fails the build when a file has none.

  Static `of()` factories are gone. A class that converts or validates names its source: `AgentName.from`, `Actor.fromId`, `ToolCallNotice.fromCall`, `ZodToolSchema.fromSchema`. A class that only holds what it was given takes it in the constructor: `new RunLimits(...)`, `new ModelIdentity(...)`, `new Secret(...)`.

  Methods start with a verb and never end in `Of` or `For`: `PricingSource.findPrice`, `ZodToolSchema.buildDeclaration`, `ToolMetadata.readEffect`.

  Classes are named by their layer: `AdkRuntimeHost` is `AdkRuntime`; `AdkComposer`, `AskAgent`, `DecideApproval`, `DelegateAgent`, `CreateSession`, `InspectSession` and `AgentSwitch` are `*UseCase` classes with a single `execute`; `ContextManager` is `ContextService`; `SessionManager` is `SessionRepository`.

### Minor Changes

- f9bd943: Who is calling, who may, and the same answer for an MCP client.

  A tool that reads a person's data needs to know which person, and the run never did. `ask`, `approve` and `reject` now take an `actor`, an id and claims the runtime never reads, and every tool of the run receives it as `context.actor`, handovers and delegations included.

  ## An access policy, asked on every path

  `AdkAccessPolicy.decide(tool, invocation, actor)` is asked before every invocation, after the arguments were parsed and before any approval is requested, so nobody approves a call the actor could not make. A refusal reaches the model as the tool's result, with the policy's reason. Declare it on `RuntimeOptions.tools.access`; without one, `OpenAccessPolicy` grants everything, which is what an application that wrote none meant.

  ## What a class publishes

  `@McpController({ tools })` declares what is served to MCP clients in the shape `@Agent({ tools })` declares what a model is offered: shared `@Tool` classes listed, `@Tool` methods on the class itself as client-only tools. A class an agent and a controller both list is one tool. A name two controllers publish fails the boot with `DuplicateExposedToolError`, naming both.

  ## The server

  `McpServerModule.forRoot({ path, name, version, actors, imports, decorate })` in `@nestjs-adk/mcp` serves what the controllers published at one path, over stateless streamable HTTP. `actors` is the application's `McpActorResolver`, which turns a request into an actor or throws `McpUnauthorizedError` with the `WWW-Authenticate` challenge to write back. Every call walks the core's own `ToolGate`, so an outside client cannot do what the agent could not, because both go through one code path.

- f9bd943: MCP OAuth: renewal goes through the guard and stops lying about dead credentials, registration keeps what RFC 7591 and 7592 return, and the flow gained revocation and a client to configure it with.

  Renewal was the one request in the package that called `fetch` directly. The token endpoint came out of the server's own metadata, so it is untrusted input like every other address the flow reaches: a server naming `https://10.0.0.5/token` had an unguarded request pointed at it every time a token expired. It now goes through `guardedFetch`, with `allowPrivateNetwork` and `fetch` on `OAuthAuthOptions` for the operator's own network and for a corporate proxy.

  Every refusal of a renewal was reported as `McpReauthRequiredError`. A provider answering 429 or 502 revoked nothing, and marking the integration as disconnected over it sends the user through consent for nothing and has the application discard a refresh token that still works. Refusals are now classified: `McpTokenGrantError` carries a `rejection` of `"transient"`, `"reauth-required"` or `"invalid-request"`, decided by the OAuth error code first and the status second, and only the terminal one becomes `McpReauthRequiredError`. A transient one reaches the runtime as `ToolSourceUnavailableError` instead. `McpReauthRequiredError` is now an `AdkError` with the code `MCP_REAUTH_REQUIRED`.

  `McpTokenEndpoint` is the exchange, the renewal and the revocation in one class, which is why they no longer disagree: the renewal read only JSON while the exchange read both dialects, and neither knew about client authentication methods other than `client_secret_post`. The method is now negotiated against the server's `token_endpoint_auth_methods_supported`, `client_secret_basic` included with the RFC 6749 section 2.3.1 encoding, and the registration's own answer wins over what was asked for. `grant_types` is likewise intersected with what the server announces, since asking for `refresh_token` where it is not offered is how a whole registration gets refused.

  Registration keeps what it used to drop: `client_secret_expires_at` as `secretExpiresAt`, so a lapsed registration is something an operator can see coming rather than every renewal failing at once months later, and the RFC 7592 `registration_access_token` and `registration_client_uri`, without which a client this package created can never be deleted. `McpOAuthClient.unregister` deletes it. `McpTokens.scope` carries what the provider actually granted, which may be narrower than what was asked for.

  `McpOAuth.revoke` hands a token back on uninstall, when the provider publishes a `revocation_endpoint`. Discovery now reads that endpoint, along with `token_endpoint_auth_methods_supported` and `grant_types_supported`.

  `McpOAuthClient` is the flow as a class, for everything the stateless `McpOAuth` facade cannot take: private networks, extra RFC 7591 client metadata a particular provider asks for, a preferred order of client authentication methods, and a substituted fetch. `McpOAuth` keeps working unchanged.

  Two fixes to what discovery answers. The RFC 8707 `resource` was reduced to the origin, which names a different resource on any server not mounted at the root: it is now the identifier the server publishes for itself, falling back to the whole URL, path included. And discovery refused plain HTTP unconditionally, while the target guard allows it for an address that really is private, which left a local MCP server reachable by the transport and unreachable by the flow that authorizes it. The refusal is now the guard's to make, so `allowPrivateNetwork` means the same thing everywhere.

- f9bd943: A tool left out of an MCP source cannot be declared and cannot run, and a source name can identify one installation of an integration.

  `tools` was a filter over the catalog and nothing else: it decided what `open()` declared, and `callTool` never asked. The tool was hidden from the model and still perfectly callable, which is the wrong half to enforce. A tool result comes from a third party and enters the model's context, so a compromised server can talk the model into naming a tool the user switched off, and a model invents tool names on its own.

  The question is now one object, `McpToolFilter`, asked when the catalog is built and again on every call. A refused call is answered to the model as a tool that is not available on that server and reaches no network, before the connection is even consulted. Whatever path reaches a tool next asks the same object rather than growing a second copy of the rule.

  `excludeTools` joins it, because a product that lets people switch an integration's tools off stores the refusal, not the permission. Both lists carry the server's own tool names, never the published `mcp__<name>__<tool>` form: the prefix is presentation and may change, while what an application stored is what the server called the tool. When both name one tool, the denial wins.

  ```ts
  new AdkMcpServer({ name, transport, excludeTools: ["delete_repo"] });
  ```

  ## A name that can be one installation

  `name` is the connection's identity inside a run, and the same integration connected twice, two GitHub accounts of one person, needs two: a slug would publish two `mcp__github__create_issue` and leave the model unable to say which account it means. That was always the intent, and nothing enforced it, so the failure landed on the provider instead: a name with a space or a qualified name past 64 characters is a 400 that takes down every tool of the turn, not only the integration that caused it.

  `name` is now validated where it is written. Letters, digits, `_` and `-`, at most 47 characters, or the constructor throws `McpInvalidSourceNameError` before any connection: the 47 is the 64 characters providers accept minus `mcp__`, the separators and room for a tool. It is rejected rather than normalized, since normalizing collapses two installations onto one prefix, which is the collision this exists to prevent.

  A qualified name that still passes 64 is shortened deterministically instead of dropped: the first 55 characters, then `_` and eight hexadecimal digits of the full name's SHA-256. It is a pure function of the full name, so it is the same on every run, and the digest is what keeps two long tools of one server apart, which truncation alone would not.

### Patch Changes

- d00a048: MCP OAuth: find the well-known documents where they actually live, and read the token response in either dialect.

  Discovery only ever asked the root of the host. RFC 9728 and RFC 8414 section 3.1 insert the path after the well-known segment, so a server mounted on a path publishes at `/.well-known/oauth-protected-resource/mcp` and legitimately answers 404 at the root. GitHub's MCP server does exactly that, and the flow reported it as a server publishing no authorization metadata at all. Both documents are now looked up path-inserted first, then at the root. Asking the path-inserted location first also matters on a shared host, where the root document describes another tenant. OpenID Connect is the one dialect that appends the path instead of inserting it, so `{issuer}/.well-known/openid-configuration` is probed too, which is where a provider like a Keycloak realm actually publishes.

  The issuer check now compares the whole issuer, path included, not just the origin. On a shared host the tenants differ only by path, and an origin comparison would accept a document describing another tenant, which is the confused-deputy setup the check exists to stop. A trailing slash does not fail it.

  Token exchange assumed JSON. GitHub answers `application/x-www-form-urlencoded` unless asked otherwise, and `JSON.parse` on `access_token=...` threw a syntax error that read like a broken provider instead of a working one in another dialect. The request now sends `accept: application/json`, the response is decoded by its content type with the other dialect as fallback, and an OAuth error riding on a 200 is reported as that error instead of "token response carried no access token".

  Registration failures carry the provider's own `error_description` alongside the status. "Registration failed with 400" sent the operator to read the client's code, when the body already said the integration was not allowlisted.

  `McpDiscovery.codeChallengeMethodsSupported` exposes what the server announces. Observability only: PKCE with S256 is always sent, as the spec requires, and the field lets an application learn from telemetry which servers do not announce it.

- Updated dependencies [d00a048]
- Updated dependencies [d00a048]
- Updated dependencies [d00a048]
- Updated dependencies [d00a048]
- Updated dependencies [d00a048]
- Updated dependencies [d00a048]
- Updated dependencies [d00a048]
- Updated dependencies [d00a048]
- Updated dependencies [d00a048]
- Updated dependencies [d00a048]
- Updated dependencies [f9bd943]
- Updated dependencies [f9bd943]
- Updated dependencies [f9bd943]
- Updated dependencies [f9bd943]
- Updated dependencies [f9bd943]
- Updated dependencies [f9bd943]
- Updated dependencies [9837bbb]
- Updated dependencies [6f97cbe]
- Updated dependencies [4591e24]
- Updated dependencies [732ac7e]
- Updated dependencies [b6d1bd3]
- Updated dependencies [627334b]
- Updated dependencies [5e1f86f]
- Updated dependencies [ae5b34e]
- Updated dependencies [ae5b34e]
- Updated dependencies [ae5b34e]
- Updated dependencies [ae5b34e]
- Updated dependencies [ae5b34e]
- Updated dependencies [ae5b34e]
- Updated dependencies [ae5b34e]
- Updated dependencies [ae5b34e]
- Updated dependencies [ae5b34e]
- Updated dependencies [ae5b34e]
- Updated dependencies [ae5b34e]
  - @nestjs-adk/core@2.0.0

## 1.0.0

### Minor Changes

- 84cd3b8: Typed agent state and loop limits.

  - `state` on `@Agent`: a Zod schema validated at run entry (ask() and store hydration, before any model call) and on every write to a declared key (`ctx.state.set` / `outputKey`). Undeclared keys pass through. New `AgentStateInvalidError` and `AgentStateMissingError`.
  - `StateBag<TState>` and `ToolContext<TState>` generics (default keeps current behavior) plus `ctx.state.require(key)` for mandatory reads.
  - Opt-in loop caps: `maxIterations` (model/tool round trips per run) and `maxConsecutiveToolFailures` (per-tool circuit breaker, a success resets). Resolution: `ask()` override > `@Agent` > `forRoot({ defaults })`. Exceeding aborts the engine via signal and throws `AgentMaxIterationsError` (with aggregated usage and last requested tool) or `ToolRepeatedFailureError`.
  - Run logs: aborts always log as warn with duration and usage; breaker escalation logs at debug level.
  - Google engine: tool-call-only turns now emit `llm_response` (no text) carrying usage, so loop cost is aggregated correctly.

### Patch Changes

- Updated dependencies [84cd3b8]
  - @nestjs-adk/core@1.0.0

## 0.0.3

### Patch Changes

- 3928827: Rewritten documentation: each package now ships a complete, linear README in simple English, with the main guide living in @nestjs-adk/core.
- Updated dependencies [3928827]
  - @nestjs-adk/core@0.0.3

## 0.0.2

### Patch Changes

- English package READMEs, dependency security upgrades (npm audit clean) and vitest 4 compatibility for caller-relative prompt paths.
- Updated dependencies
  - @nestjs-adk/core@0.0.2

## 0.0.1

### Patch Changes

- Primeira versão: decorators (@Agent/@Tool/@Skill/@WorkflowAgent) com registro via providers do Nest (a instância é o handle: ask/stream/approve/reject), AdkModule com discovery fail-fast, prompts (string, AdkPrompt builder ou promptFile), modelos como classes (Gemini/OpenAiLike/ModelRouter com failover), structured output validado, Continuity (offload automático, compaction nativa, HITL approve/reject), embeddings (Embedder + Similarity), logs por nível com tokens I/O/C, MCP client e pacote de testing (TestAgent, ScriptedEngine/ScriptedModel, matchers, judge).
- Updated dependencies
  - @nestjs-adk/core@0.0.1
