# @nestjs-adk/google

## 2.0.0

### Major Changes

- d00a048: Failover is declared where the agent is, `ModelRouter` is gone, and a request the provider refused stops the chain.

  ## Breaking: `ModelRouter` is gone

  It never routed anything. It was an ordered "try the next one on failure" pretending to be a bigger concept, and it delegated each request still naming the router as its model. Gemini reads the request's model before its own, so the router's display name reached the API as a model id and every target failed with the same 400, making a broken name look like a provider outage.

  Failover is now declared on the agent, and the list becomes a `SequentialFailoverPolicy`:

  ```ts
  @Agent({
    name: "sales",
    description: "Sells.",
    model: primary,
    failover: [cheaper, elsewhere],
  })
  export class SalesAgent extends AdkAgent {}
  ```

  A policy of your own extends `AgentFailoverPolicy` and receives the failure as data together with `FailoverContext`: the model that was serving, and the attempts already made, oldest first. It answers a `ModelReroute` or nothing, and nothing surfaces as `ModelsExhaustedError` carrying every failure.

  The executor enforces two rules. Failover advances only on failures before the first chunk, because after a chunk part of the answer already reached the consumer, and an aborted request never fails over. The events a run journals carry real model ids rather than target nicknames, which is what logs and billing want.

  ## Breaking: `InvalidRequestFailure`

  The failure taxonomy had no way to say "what you sent is wrong". A 400 about a field, a rejected key, a model that does not exist: all of them arrived as `UnknownFailure`, which reads like the provider had a bad day. Both adapters now classify a 4xx that is none of the recognised cases as `InvalidRequestFailure`, and `ModelFailure` answers `isInvalidRequest`.

  `SequentialFailoverPolicy` stops on it. Every model in a chain is sent the same request, so a provider that called it malformed is describing something the next attempt carries unchanged: continuing spent a call per model to arrive at the first answer, with the cause buried under a list of models that were never the problem. A policy that wants the other bet, that a second provider accepts what the first refused, writes it, since the failure is handed over precisely so it can be decided on. Failover on a permanent failure is unaffected where it makes sense: a context window too small for the prompt is exactly what a bigger model is for.

  ## Typed options, and a provider the library knows nothing about

  Generation parameters are typed rather than passed through a bag, so a typo fails the build instead of being silently dropped, and `createModelSpec<Map>` restricts options per model name when a model does not accept a given parameter. The capability map belongs to you, since the library does not ship one that would go stale.

  `LlmModel` is the extension point for a provider neither adapter covers. It is an abstract class in the core with full dependency injection, named in `@Agent({ model })` like any other, over a neutral contract that covers streaming, multi-part content, tool calling, usage and structured output. `ModelDescriptor` is not decoration: the context window is what compaction measures against, and the capabilities are what the runtime checks before it accepts an attachment or offers tools.

  ## Structured output is checked before it is claimed

  The OpenAI adapter asks for `strict: true` on every `outputSchema`, which is what makes the provider enforce the shape rather than suggest it. Strict mode only accepts a subset: every object closed with `additionalProperties: false`, every declared property listed in `required`. A schema outside it came back as a 400 naming a field, reaching the caller as a failed run instead of as the mistake it is.

  The adapter now validates the schema first and throws `NonStrictJsonSchemaError`, naming the object and what it lacks (`the object at properties.customer leaves "name" out of "required"`). Nothing downstream catches this: the default validator in the core reads the answer as JSON without a schema language, so dropping `strict` quietly would trade a loud 400 for a shape nobody verifies. Gemini is unaffected, since `responseJsonSchema` accepts either shape.

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

- 6f97cbe: Safe defaults out of the box, and every policy the runtime consults is now a component you can replace.

  A destructive tool waits for a person unless you say otherwise: `RuntimeOptions.tools.approvals` defaults to `EffectApprovalPolicy.destructiveOnly()` instead of `never()`. The trade is not symmetric. The cost of this default being wrong is a run that waits for a click; the cost of the old one being wrong is a refund nobody agreed to. Say `EffectApprovalPolicy.never()` to run everything unattended.

  A run stops after fifty iterations unless you say otherwise. `RunLimits.maxIterations` was absent by default, which read as trust and behaved as a bill: a model looping on a tool it cannot satisfy spent money until somebody noticed. `RunLimits.unbounded()` takes the ceiling off, and it is a declaration rather than a field left out.

  `OffloadPolicy`, `SnapshotPolicy`, `EventRedactor` and `CompactionStrategy` are ports now, each with the old behavior shipped as a class you can keep: `CharacterCountOffloadPolicy.byDefault()`, `RevisionBucketSnapshotPolicy.everyFiftyEvents()`, `new FieldNameEventRedactor(["senha"])` and `OldestFirstCompactionStrategy`. All four are declared in `RuntimeOptions`, which is how `ContextSummarizer` and `PricingSource` already arrive, so a component the container built reaches the runtime through the same seam.

  `MeteredEmbedder` is gone. `Embedder.embedMetered` answers for every embedder, defaulting to a usage of nothing under an identity taken from the class name, so `PricedEmbedder` no longer asks what kind of embedder it was handed. An embedder whose provider reports usage overrides the method.

  `GeminiOptions.apiKey` and `OpenAiOptions.apiKey` take a `Secret` or a plain string. Whatever they are handed is wrapped at the option boundary and revealed once, at the call that builds the SDK client, so a key never travels as a bare string that a log can print.

  Deleting a conversation now goes through `SessionService.delete`, which removes the journal, its artifacts and what the attachment cache was holding for it. That cache is keyed by session and id, and a delete behind its back left it answering with bytes that no longer exist; `AttachmentReader.forget(context)` is public for an application that deletes through the port itself.

- 4591e24: A name says what it does.

  Every file now declares its category in its suffix (`session-storage.contract.ts`, `ask-agent.use-case.ts`, `agent-name.value-object.ts`), and a spec fails the build when a file has none.

  Static `of()` factories are gone. A class that converts or validates names its source: `AgentName.from`, `Actor.fromId`, `ToolCallNotice.fromCall`, `ZodToolSchema.fromSchema`. A class that only holds what it was given takes it in the constructor: `new RunLimits(...)`, `new ModelIdentity(...)`, `new Secret(...)`.

  Methods start with a verb and never end in `Of` or `For`: `PricingSource.findPrice`, `ZodToolSchema.buildDeclaration`, `ToolMetadata.readEffect`.

  Classes are named by their layer: `AdkRuntimeHost` is `AdkRuntime`; `AdkComposer`, `AskAgent`, `DecideApproval`, `DelegateAgent`, `CreateSession`, `InspectSession` and `AgentSwitch` are `*UseCase` classes with a single `execute`; `ContextManager` is `ContextService`; `SessionManager` is `SessionRepository`.

- b6d1bd3: Options in groups, commands as objects, and a retry that is not a failover.

  **`RuntimeOptions` is five groups plus `limits`.** Eighteen positional parameters became `context`, `cost`, `tools`, `lifecycle` and `model`, each its own value object with its own defaults and its own `with`. `RuntimeOptions.from` and `RuntimeOptionsPatch` are nested to match, and a group named partially keeps the fields beside it, so `{ cost: { pricing } }` leaves `pricingNotices` alone.

  ```ts
  RuntimeOptions.from({
    context: {
      summarizer,
      compaction,
      compactionStrategy,
      attachments,
      offload,
      contextNotices,
    },
    cost: { pricing, pricingNotices },
    tools: { approvals, access, sources },
    lifecycle: { shutdown, snapshots, consumers, consumerNotices, redactor },
    model: { resolver, retry },
    limits,
  });
  ```

  `models` is now `model.resolver`, and `limits` stayed at the top because it is the one answer here that is a number rather than a component. The `ADK_RUNTIME_PATCH` token and `AdkTestBedBuilder.withRuntime` take the same nested shape. The runtime group of tool options is exported as `ToolingOptions`, because `ToolOptions` already means what `@Tool` declares.

  **Long parameter lists became input objects.** `new AgentDefinition({ name, description, model, ... })`, `new AgentRunCommand({ agent, input, ... })`, `new AskInput({ message, attachments, sessionId, references, metadata, limits })`, `new ModelRunCommand({ ... })`, `new PrepareContextCommand({ ... })`, `new ApproveInput({ ... })`, `new RejectInput({ ... })` and `new AdkModuleOptions({ ... })`. `AskInput.fromMessage(message, sessionId?)` is unchanged; `AskInput.with` is gone, and so are `ToolOutput.with` and `ToolOutput.fromData`, replaced by `new ToolOutput(data, media?)`.

  **`AgentRegistry.get` is `AgentRegistry.open`.** It creates the handle when there is none, which is what `open` promises and `get` does not.

  **A model is now asked again before another one is asked instead.** `ModelRetryPolicy` is a new component, consulted by `ModelRunner` before `AgentFailoverPolicy`. `BackoffRetryPolicy` ships on by default: two retries, exponential backoff with full jitter, capped at twenty seconds, and a `Retry-After` the provider sent wins over any calculation. Only a transient failure is retried, so a refused request, a safety block and a context overflow still go straight to failover. Attempts are counted per model, so each link of a chain gets its own budget, and a chain that exhausts everything still fails with `ModelsExhaustedError`.

  ```ts
  runtime: RuntimeOptions.from({ model: { retry: new BackoffRetryPolicy(4) } });

  @Agent({ name: "charger", description: "...", retry: false }) // never repeats a call
  ```

  `RateLimitedFailure` and `UnavailableFailure` carry a `retryAfter: Duration`, and the Gemini and OpenAI mappers fill it from the provider's `Retry-After` header in either of its RFC 9110 forms. `ModelFailure.retryAfter` answers `undefined` for every other failure, so a policy never asks which class it is holding.

  `Clock` gains `sleep(duration, signal?)` with a real timer as its default, and `FakeClock` advances itself instead and records what it was asked to wait for. Nothing in the runtime waits any other way, so a backoff is asserted rather than waited for. A `Clock` written outside this package keeps working untouched.

### Minor Changes

- d00a048: Gemini takes a call another provider wrote, and fetches a remote file by URL.

  ## A foreign tool call no longer kills the run

  Gemini 3 signs the function calls it generates and refuses a turn whose calls come back unsigned. A conversation that changed model has calls nobody here can sign, and there are three ways it gets one: a transfer to an agent running elsewhere, a `ModelResolver` routing a hop, and a failover rerouting the turn to the next model in the chain. All three ended the same way, with a 400 naming a tool.

  The failover case was the worst of them. The 400 is a refused request, `SequentialFailoverPolicy` correctly stops the walk on one, and the run died with `ModelsExhaustedError` carrying a malformed-request message about a tool. The mechanism that exists to rescue the run was what ended it, and the reason pointed at the tool's schema.

  `GeminiRequestMapper` now fills an unsigned call with `skip_thought_signature_validator`, the placeholder Google documents for transferring a trace from a different model. It is scoped the way Google scopes validation: the turn being answered only, and only the call that opens a step, since a parallel call after it is exempt. A signature the provider gave is never touched, and the placeholder never leaves the mapper, because a stored signature that is really a placeholder is worse than none.

  Every model gets it except one whose name states a generation below 3, and that default was measured rather than assumed. `gemini-flash-latest` answers as `gemini-3.6-flash` and refuses an unsigned call, so treating Google's own moving alias as an old model would leave the bug in place for anyone following Google's naming. The opposite mistake costs nothing: `gemini-2.5-flash-lite` accepts a signature it never issued and answers normally.

  Google discourages synthesised call blocks and warns the model reasons worse without the true signature. That trade is made for a handover the application never asked about, and for nothing else.

  ## `MEDIA_URL` is declared

  `fileUri` used to take only Google's own Files API, so a remote link handed to Gemini was a string nobody fetched. Since January 2026 the API fetches files from public HTTPS addresses and from signed URLs, with S3 pre-signed and Azure SAS named explicitly, and the request mapper already sends a remote part exactly that way. With the capability declared, `SignedUrlAttachmentResolver` mints a fresh address for a turn Gemini serves instead of replacing the image with a note.

  One reliability note: `googleapis/js-genai#1385` reports intermittent "Cannot fetch content from the provided URL" for S3 pre-signed URIs, where the URL stays valid and a retry succeeds. An application running signed URLs against Gemini should expect to retry that failure.

### Patch Changes

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
