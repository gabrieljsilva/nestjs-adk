# @nestjs-adk/core

## 2.0.0

### Major Changes

- d00a048: Declaring an application: options built in the container, edges as classes, prompts per run, and discovery that survives a substituted provider.

  ## Options that come from the container

  `forRoot` takes a value, which is enough while every option is one. Most of what an application eventually plugs in is not: a storage holding a database client, an embedder that needs credentials, a pricing source with an HTTP client, an approval policy that reads the current tenant. None of those exist where the module is declared, and the only way out was a wrapper module that spread the library's `forRoot` and overrode `ADK_OPTIONS`, resting on a token that was never promised to keep meaning what it means.

  ```ts
  AdkModule.forRootAsync({ imports: [InfraModule], useClass: AdkOptions });
  ```

  `useClass` is the form to reach for, and the reason is types. A factory declares its dependencies in an `inject` array TypeScript cannot line up with the parameters that receive it, so two entries swapped compile and fail at boot; a class declares them in a constructor NestJS resolves and TypeScript checks like any other provider's. `AdkOptionsFactory` is the interface it implements, `useExisting` points at an instance another module already provides, and `useFactory` with `inject` is there for the cases that want it.

  Declaring none of the three is refused, and so is declaring two, both where `forRootAsync` is called rather than during the boot they would otherwise poison, carrying `ASYNC_OPTIONS_NOT_DECLARED` and `CONFLICTING_ASYNC_OPTIONS`. `forRoot` is untouched, and an application using it has nothing to do.

  `RuntimeOptions` and `AdkModuleOptions` gain `from` and `with`, so three fields change without restating twelve.

  ## Edges declared as classes

  ```ts
  @TransfersTo(SalesAgent, WarrantyAgent)
  @DelegatesTo(BillingAgent)
  export class ConciergeAgent extends AdkAgent {}
  ```

  Renaming an agent now follows on its own, the editor finds the declaration, and a target that does not exist fails the build instead of the boot. `@TransfersTo("biling")` compiled fine and only spoke up when the application started.

  Two agents that reach each other cannot name each other directly, because a decorator runs while its own class is being defined and the other end is still `undefined`. Pass a function there, the same shape an ORM uses for a relation that points back: `@TransfersTo(() => BillingAgent)`. Resolution happens during the scan, in `onModuleInit`, once every module has loaded.

  Plain names still work and remain the only form for an agent whose class a module does not import; they are also what travels on the wire, since the model transfers by calling `transfer_to_agent` with a name. A class that never declared `@Agent` is `InvalidAgentMetadataError` at boot, and a function that throws while being read reports what it threw as `cause`. The target still has to be a registered provider, so `UnknownTransferTargetError` stays.

  ## A prompt built per run

  `@Agent({ prompt })` still declares a fixed text. What is new is overriding `prompt()`, for an instruction that depends on data:

  ```ts
  @Agent({ name: "support", description: "..." })
  export class SupportAgent extends AdkAgent {
    public constructor(private readonly customers: FindCustomerUseCase) {
      super();
    }

    protected override async prompt(context: PromptContext): Promise<string> {
      const customer = this.customers.execute(context.owner?.value ?? "");
      return this.prompting.renderFromFileOrFail("support.md", {
        name: customer.name,
      });
    }
  }
  ```

  The agent is an ordinary provider, so the repository that knows the customer is a constructor argument. That is the point of the shape: the data reaches the system prompt instead of being concatenated into the user's message, which is the one place a model has been told to treat text as somebody else's words.

  `this.prompting` answers three things. `render(template, vars)` interpolates text the agent already has, so prompts kept in a database need no port at all; `renderFromFile(path, vars)` answers `undefined` when there is no such prompt, and `renderFromFileOrFail(path, vars)` throws naming the path the source resolved. `{{name}}` is optional and renders as nothing, `{{{name}}}` is required and a prompt missing one fails naming every missing key at once, with `null` counting as missing for both.

  Prompts are files by default, read once and served from memory, from `./prompts` or from the directory named in `prompts: { dir }`. Implement `PromptSource` and pass `promptSource` to serve them from anywhere else; declaring both is refused, since `prompts.dir` configures the source the other one replaces. Replacing the source changes nothing about the agents, because they pass a name and never a location. Three things are the source's own: caching, for which `PromptFileCache` is exported, failure, since whatever `load` throws ends the run, and construction, since `promptSource` takes an instance.

  `PromptContext` carries the session id, the run id, the agent about to answer, the session's owner and the run's signal. The owner is the session's rather than the call's, so a conversation continued tomorrow builds for the same person it was opened for.

  A prompt built per run is a prompt the provider cannot cache: the system prompt is the head of the prefix, and this repository measured 3031 of 3751 prompt tokens coming back cached, worth 68% of that run's input bill. Keep the variable part small and stable within a session: a customer name is fine, a timestamp is not. It resolves once per agent per run, before the first turn, and a transfer or a delegation resolves the prompt of whoever took over. Declaring `@Agent({ prompt })` and overriding `prompt()` on the same agent fails at boot, because any precedence rule would leave one declaration reading like a configured prompt the model never received.

  ## Breaking: discovery reads the injection token, and a listed tool nobody registered fails the boot

  The scan took both a component's identity and its declaration from the provider's `metatype`, which NestJS rewrites the moment a provider is overridden: `useValue` leaves no metatype at all, `useClass` leaves the replacement class, `useFactory` an anonymous function. Meanwhile `@Agent({ tools: [FindOrderTool] })` names an injection token, which NestJS never rewrites. The two ends stopped matching and the tool left the catalog without a word: the module booted, the agent answered, and the model was simply never offered the tool it exists to call. An overridden `@Agent` class vanished the same way, resurfacing later as `AgentNotBoundError` naming a class nobody wrote.

  All three forms now work, for tools and for agents, reading the token first and falling back to the metatype, which keeps `{ provide: SHIP_ORDER, useClass: ShipOrderTool }` working.

  `@Agent({ tools: [FindOrderTool] })` naming a class absent from `providers` used to produce a shorter tool list and no complaint. It is now `UnregisteredToolError`, naming the agent, the class and the tools that were found. Two consequences worth checking before upgrading: a decorated class registered through a value or a factory was invisible to the runtime and is now a live tool, and a double registered as a value without an `execute` method now fails at boot instead of vanishing. `ToolMetadata.copy` is gone, since it existed to make a replacement class declare a tool it was not.

  `@Agent` also refuses a field it cannot use. Leaving one out still means the default; declaring one the runtime cannot use fails at boot with `InvalidAgentMetadataError` naming the provider and the field, instead of falling back in silence while the developer believes the agent is configured. It covers `model`, `prompt`, `compaction`, `tools`, `limits` and `failover`, and a failover list says which entry is wrong rather than cancelling the whole chain over one typo.

- d00a048: The barrel now publishes what you write against, and nothing else: 79 internal classes are no longer exported.

  `@nestjs-adk/core` exported 292 names. Most of them were the runtime doing its work: the class that executes a tool, the one that counts failures, the one that publishes events, the commands they pass each other. None of it was documented, none of it was usable on its own, and all of it was in the way. An editor offered `ToolBreaker`, `DelegatedTurnLoop` and `EventRedactor` to somebody who was trying to write an agent.

  What is published now is the surface an application actually touches: the decorators and the module, `AdkAgent` and `AdkTool`, the ports you implement, the adapters the library ships, the policies you choose between, and the values you read off a result or hand to a call. 213 names, all of them documented in the README.

  Two groups that look internal stayed, because they are contracts with the outside rather than plumbing: the message and tool-call types (`ModelMessage`, `ToolCallMessage`, `ToolResultMessage`, `ToolCallDelta`, `ToolDeclaration`), since writing a model adapter means translating them, and `ToolDefinition`, since a `ToolSource` has to build one.

  Removed, grouped by what they were:

  - run and turn internals: `AgentRunner`, `TransferSessionUseCase`, `ChunkStream`, `DelegateAgentUseCase`, `DelegatedTurnLoop`, `DelegationRequest`, `DelegationRunner`, `ExplainAgentUseCase`, `InspectSessionUseCase`, `ModelRunCommand`, `ModelRunOutcome`, `ModelRunner`, `StreamAgentUseCase`, `TransferGate`
  - tool internals: `ActivateSkillTool`, `DelegateToAgentTool`, `ParsedArguments`, `ReadArtifactTool`, `SkillCatalog`, `SkillDefinition`, `ToolBreaker`, `ToolCatalog`, `ToolExecutionCommand`, `ToolExecutor`, `ToolInvocation`, `ToolOutcome`, `ToolSourceScope`, `TransferToAgentTool`
  - session and event internals: `AppendEventsCommand`, `AppendEventsResult`, `ApprovalDecision`, `ApprovalStatus`, `ApproveInput`, `AskInput`, `ConsumerFailed`, `DelegateInput`, `EventPublisher`, `EventRedactor`, `PendingTurn`, `RejectInput`, `Session`, `SessionEventCodecs`, `SessionSnapshot`, `SessionStateCodec`, `StoredSessionEvent`
  - agent composition internals: `AgentDelegationPolicy`, `AgentExecutionPolicies`, `AgentTransferPolicy`, `DeclaredAgent`
  - context and artifact internals: `ArtifactContent`, `ArtifactId`, `ArtifactOffloader`, `ArtifactReference`, `AttachmentReader`, `AttachmentStore`, `CacheEfficiency`, `CacheReport`, `CapturedContexts`, `CompactionDecision`, `ContextBudget`, `ContextCapture`, `ContextCheckpoint`, `ContextPhotographer`, `ModelMessageRole`, `OffloadedContent`, `PrefixDivergence`, `PrefixReport`, `ProjectedMediaCost`, `PromptMeasurement`, `ToolCall`
  - cost internals: `AppliedRates`, `BilledCall`, `CallCost`, `CostCalculator`, `MeteredEmbedding`, `PriceBand`, `PricedEmbedding`, `RunCostReporter`

  If you were importing one of these, say what for: either it belongs on the public surface and the export comes back with documentation, or the thing you were doing needs a seam that does not exist yet.

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

- d00a048: A conversation can be opened under an id you already own, it stays with the agent it was transferred to, and a storage can be written outside this package.

  ## Opening a conversation yourself

  Until now the runtime insisted on naming every conversation: a session was born inside an `ask` that carried no `sessionId`, and the id came back on the result. An application whose chat row is the conversation had two ways around that, and both are bookkeeping: ask a question first and write the returned id onto the chat, or keep a mapping between the two.

  ```ts
  const chat = await this.chats.create({ userId: user.id });
  await support.createSession({
    sessionId: chat.id,
    metadata: { ownerId: user.email },
  });

  await support.ask("where is my order?", chat.id);
  ```

  Asking is deliberately unchanged. A question naming a conversation nobody opened is still refused with `SessionNotFoundError`, because the alternative is that a stale or mistyped id quietly becomes a second conversation instead of failing. An id that already names a conversation is refused with `SessionAlreadyExistsError` and the existing one is untouched; existence is not checked before the write, since two requests opening the same chat is the ordinary case and a read followed by a write loses that race by construction.

  `createSession` writes the head and nothing else. The journal still begins with the first question, since every event carries the run that produced it and a conversation opened outside a run has none to carry. Which run records the beginning is now decided by looking at the journal rather than by remembering who wrote the head, which also fixes a case that was already broken: a first question that created a session and then failed before committing left a conversation that could never record its own beginning.

  `ask`, `stream` and `explain` take a session id as plain text in their shorthand argument, not only as a parsed `SessionId`. The id an application holds is text, read off a chat row, and `ask(message, chat.id)` used to fall through to the options branch, where a string has no `sessionId`, and quietly opened a second conversation instead of continuing the one it named. Reading one back comes in the two usual shapes, both answering the head alone rather than replaying the journal: `findSessionById` and `findSessionByIdOrFail`.

  ## Breaking: the session decides who answers, not the handle

  A transfer used to last exactly one turn. It wrote the new owner into the session and then `ask` ignored it, so the next question was answered by whichever agent handle the application happened to call:

  ```ts
  await concierge.ask("meu controle quebrou"); // warranty answers, and owns the session
  await concierge.ask("e o prazo?", { sessionId }); // before: concierge answered. Now: warranty does.
  ```

  Which handle was called only decides anything when there is no session yet, and then it decides the root agent. Two things follow. A handover now means something after the turn it happened in, which is what the declared graph was for, since reaching a different handle was a way around it. And the owner recorded in the session no longer disagrees with the agent that just spoke, which was a real defect: a run that suspended for approval could be resumed by a different agent than the one that asked for it, because the approval path read the owner and `ask` did not.

  To move a session from code, use `AgentRunCommand.transferTo`. It goes through the same gate the model's `transfer_to_agent` does, so a handover nobody declared is still refused. Ownership is derived rather than stored twice: `AgentTransferred` in the journal is the truth, `SessionState.activeAgent` is the projection, and the snapshot is a disposable cache.

  A delegation also journals the model that served it. The child's model used to be resolved twice, once to run the turn and once to write it down, and a `ModelResolver` routing by load, cost or time answers two different questions when asked twice, so the journal could name a model that never served the turn.

  ## A storage you can write yourself

  The port was public and its parts were not. Writing an adapter meant encoding a `SessionEvent` on the way in and rebuilding it on the way out, and both sides went through the codec registry, the event header and six identity types, none of them exported. The only storages that could exist were the two that ship here.

  The failure was quiet, which is the part worth stating. An adapter can serialize an event by hand and read it back as something with the right fields, and both projectors decide by class: what the model reads and what the runtime knows are built by matching concrete event types. A duck typed object matches none of them, so a rehydrated conversation comes back empty and a suspended turn comes back with nothing pending. No error, a full journal in the database, and an agent answering as if the customer had just said hello.

  What is published is codecs instead of parts. `StorageCodecs.standard()` answers with four, one per collection a storage keeps: `journal`, `snapshot`, `head` and `checkpoint`. Each turns a domain object into a record of plain values and back, and `decode` takes the row the driver handed back, whether its JSON column arrived parsed or as text. An adapter moves rows and decides about revisions, transactions and races, which is its job; what a row means stays in here, and so do the event classes, the headers, the projected state and the blocks of a compacted context, which are therefore still free to change.

  They go in the root entry, next to the port and the two adapters that implement it, for the reason `PromptFileCache` sits next to `PromptSource`: implementing a port is something an application does. `CheckpointCodec` is new, and with it a durable storage can keep compaction checkpoints for the first time. `JournalCodec.calculateFingerprint` is the definition of "the same event" an idempotent append needs, so two adapters cannot disagree about which writes are retries. The four errors the port must throw are published too, and `SqliteSessionStorage` now goes through the same four codecs, which is what keeps a row written here and a row written downstream meaning the same thing.

  The two adapters that ship are for development and for tests: in memory while a process runs, SQLite for the same thing on disk. Anything carrying production traffic is somebody else's adapter, written against the database the application already runs, and `SessionStorageContractSuite` in `@nestjs-adk/testing` is how it is measured.

  **Breaking:** `RuntimeServices.sessions` is now a `SessionService` carrying `create`, `inspect`, `find` and `findOrFail`, so `runtime.sessions.handle(id)` is `runtime.sessions.inspect(id)`. It reaches only code that embeds the runtime through `AdkRuntime` without NestJS. Everything an application writes against an agent is additive: no existing signature changed.

- d00a048: Conversations are compacted by default, and an application can read how full the window is.

  Before this, compaction was off unless the application declared a policy, and a policy took absolute token counts. Both were wrong in the same way. A conversation nobody had thought about grew until the window refused the call, so the failure arrived at the customer rather than at the developer; and an absolute count is not portable, since two hundred thousand tokens is comfortable in a window of a million and impossible in one of a hundred and twenty eight thousand.

  `WindowShareCompactionPolicy` decides in shares of the model's own window. Declaring nothing gets it: compaction at nine tenths, down to seven, keeping the four most recent blocks, which is what Cline and Cursor do.

  ```ts
  new WindowShareCompactionPolicy({
    maxShare: 0.9,
    targetShare: 0.7,
    keepRecentBlocks: 4,
  });
  ```

  `compaction: false`, on the agent or on the runtime, turns it off for a conversation that may not lose a word, and that conversation is then refused with `ContextBudgetExceededError` rather than losing its beginning quietly. Without a summarizer declared, compaction drops rather than summarizes.

  A model that never declared a window is never compacted, because a share of an unstated limit is a number this library will not invent. The unknown window is still reported once per model through `ContextNoticeSink`, and an application that wants a conversation shortened there says the size itself by extending `AdkCompactionPolicy`.

  `AgentHandle.contextBudget(sessionId)` is the meter, and it runs no turn. It answers the window of the agent's model together with what the provider counted for the last call, so a conversation nobody has asked anything in reports a window and no size, and so does one continued under a different model until that model answers once. This is the meter and not what decides compaction: that decision is taken during a run, on the prompt about to be sent, by the policy the agent runs under.

  **Breaking:** compaction runs where nothing is declared. An application that relied on conversations never being shortened declares `compaction: false`.

- d00a048: An attachment the application owns is recorded as a name, and what it becomes is asked again on every projection.

  A question carries an image the way a tool answer does: `media` takes the bytes, or a public address the provider fetches itself, and the journal keeps a name rather than a payload. A `MediaPart` is written to artifact storage and the event holds the id, because a journal is read on every rehydration, every status check and every projection, while the image itself is only looked at when a prompt is being built.

  That shape assumes the runtime either holds the bytes or freezes an address, and a file living in the application's own bucket fits neither. A pre-signed URL expires, and because history is rebuilt on every turn it then expires for every turn that follows; one without expiry is a capability URL recorded in an append-only journal and in whatever the provider cached. There is no correct TTL for an address inside a durable record, which is the sign the address was never the right thing to record.

  `AttachmentReference.external(id, mediaType)` records identity alone, and `AskOptions.attachments` carries it into a question next to `media`:

  ```ts
  await agent.ask("what does the receipt say?", {
    attachments: [AttachmentReference.external(upload.id, "image/png")],
  });
  ```

  On every projection, including the first, the runtime hands each reference to the `AttachmentResolver` declared in `RuntimeOptions.context.attachments` and the application answers with an `AttachmentProjection`: `media(part)` puts it in front of the model, `note(text)` puts a line of text where it stood so a message that says "describe this image" still reads coherently, and `omit()` leaves it out. Resolver output is never cached and never recorded; the runtime keeps caching only what it materialized from its own storage. The one exception is a compaction checkpoint, which persists already projected blocks.

  Two resolvers ship. `InlineAttachmentResolver(loader)` fetches bytes server side and inlines them, so development against a localhost MinIO works exactly like production and no address ever travels. `SignedUrlAttachmentResolver(signer)` mints a fresh address per projection, which only makes sense in front of a model that fetches URLs itself: that is now a declared capability, `ModelCapability.MEDIA_URL`, and both shipped providers declare it. A model without it is given a note instead of an address it would read as text.

  Declaring no resolver keeps the previous behaviour, and an external reference then projects as a note naming the wiring gap. A resolver that throws becomes a note as well, because one missing file should not end a conversation that was already answered once.

  **Breaking:**

  - `MediaPart.link` refuses localhost, private IP ranges (IPv4 and IPv6, mapped forms included) and `.local`/`.internal` names with `UnreachableMediaUrlError`. The provider fetches a media URL from its own network, where that address goes nowhere, so the failure used to arrive as an opaque provider error that was already paid for. A self hosted model that can reach the address opts out with `MediaLimits.allowingPrivateHosts()`.
  - `UserMessageReceived` is at schema version 4 and `ToolResultProduced` at 5, covering the external reference shape. Rows written by older builds keep decoding; rows written by this build are refused by older builds, which never knew the shape.
  - `AskInput.with` takes a fifth optional parameter with the references, and `AskInput.hasAttachments` is true when either list has something in it, so an external reference requires a model that declared `MEDIA_INPUT`, the same as bytes.

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

- d00a048: A test bed that boots the application and lets a test decide what each agent answers on.

  ## `AdkTestBed`

  Testing an agent used to mean rebuilding the module options by position to swap one model, sharing a single script across every agent, and asserting on the double for a fake run and on a hand written consumer for a real one. The bed replaces all three.

  ```ts
  await using bed = await AdkTestBedBuilder.for({ imports: [AppModule] })
    .withScript(BillingAgent, (script) => script.mockToolCall("find_order", { orderId: "A-1042" }).mockText("349 reais"))
    .boot();

  const run = await bed.agent(BillingAgent).ask("Quanto custou o pedido A-1042?");

  expect(run).toHaveRunTool("find_order", { orderId: "A-1042" });
  ```

  It wraps `Test.createTestingModule` rather than hiding it: `overriding` passes any token straight through, so a database is replaced the way it always was. `await using` disposes the bed at the end of its block, so a suite does not leak a runtime when an assertion throws.

  ## One script per agent, and one model per agent

  `withScript` binds a script to one agent, so a transfer or a delegation can no longer consume turns queued for somebody else. Scripts are strict: a run that asks for a turn nobody queued fails naming the agent, and `bed.verify()` fails when the test described a conversation the run never had.

  `withAgentModel` decides the model agent by agent through the runtime's own `ModelResolver`, which every entrypoint consults. A real provider can decide while scripts answer, transfers and delegations included, so a paid suite pays for the decision and nothing else. A bed whose agents do not all run on a model the test chose refuses to boot, naming them, which is what keeps a suite meant to be free from reaching a provider by accident; a suite that means it says `allowingUnscriptedModels()`.

  ## The run is the evidence

  `ask` answers a `RecordedRun`: the same `AgentResult` production returns, carrying the events of that run. Matchers read those events, so the same assertion holds for a script and for a provider: `toHaveRunTool`, `toHaveRequestedTool`, `toAwaitApproval`, `toHaveDeniedTool`, `toHaveTransferredTo`, `toHaveDelegatedTo`, `toHaveStatus`, `toBeFullyPlayed`.

  `toCallTool` is gone. It read the scripted model's own requests, so it never worked against a real provider, and it could not tell a tool that ran from one that stopped in front of a human.

  Two matchers answer questions a fake cannot. `toHaveStablePrefix(threshold)` compares the exact contexts assembled across runs, measures how much of the prefix held still and, on failure, points at the segment and the text where they parted ways, which is what finds the timestamp quietly killing a provider's prompt cache. `toBeSimilarTo` compares meaning through an embedder, for an answer whose wording moves every run.

  ## A turn that arrives in pieces

  `stream` is public API and nothing outside the core exercised it: the scripted model sent every answer as a single chunk and the test agent had no way to consume a generator, so a caller that consumed `stream` had no offline level to be tested at.

  ```ts
  script.mockStream(["A garantia ", "é de 90 ", "dias."]);

  const run = await bed.agent(WarrantyAgent).stream("qual a garantia?");
  run.textDeltas; // ["A garantia ", "é de 90 ", "dias."]
  run.wasStreamed; // true
  run.text; // "A garantia é de 90 dias."
  ```

  `mockText` still sends one chunk, which is what a provider sends with streaming off, and that is the reason `mockStream` exists rather than being the default: against a single chunk, a caller that collects the whole answer and paints it once at the end passes exactly like one that paints as it goes. `StreamedRun` extends `RecordedRun` rather than wrapping it, so every matcher already written keeps working, and it drains the generator on the test's behalf, because `AgentHandle.stream` returns the result as the generator's return value and a `for await` silently discards it.

  ## A contract suite for your storage

  `SessionStorageContractSuite` is published: every promise the `SessionStorage` port makes, as cases any runner drives.

  ```ts
  const suite = new SessionStorageContractSuite();
  for (const contract of suite.cases(() => new PrismaSessionStorage(prisma))) {
    it(contract.name, () => contract.run());
  }
  ```

  It was internal to the core, so an application writing its own storage had to reimplement those tests, and they drifted from the contract as the contract grew. The drift is the dangerous part: the cases nobody rewrites are the ones about a batch written whole or not at all, a stale `expectedRevision` losing a race, and the same event id written twice being written once, and each of those breaks a session long after the test suite went green.

  It lives here rather than in the core because measuring an adapter is testing, and because `node:assert` has no business in the entry point every application loads. The cases are data, so vitest, jest and `node:test` all drive them, and the suite reads `capabilities()` to only demand what the adapter claimed. It holds nothing an implementer could not hold: it imports `@nestjs-adk/core` like any consumer and builds its events, snapshots and checkpoints by decoding rows through the published codecs, so it stops compiling if the core ever stops publishing enough to write a storage with. Both shipped adapters are measured by it here, in one place, instead of by a copy of the same loop next to each of them.

  ## Also new

  `ToolFake` replaces what a tool does while keeping the tool the application declared. `AgentStub` answers for an agent with no runtime under it, for the use case that only hands a request over. `RecordingModel` wraps any model and keeps the traffic. `RunEvents`, `RunRecorder` and `RunTranscript` moved into the package from the example application, and the transcript now labels users, agents, tool requests and responses, transfers, delegations, approvals and rejections. Paid suites load their environment in the test configuration and fail normally when a credential is missing.

  ## Core

  `ModelResolver` is a provider of the module, which is what its documentation already promised. `ADK_DEFAULT_MODEL`, `ADK_EVENT_CONSUMERS` and `ADK_RUNTIME_PATCH` replace the fallback model, append consumers and patch runtime fields by name. `AgentMetadata` and `ToolMetadata` read back what the decorators wrote. `ToolApprovalDenied` now names the tool that was refused, at schema version 2, since a journal reader could tell that somebody refused something without being able to tell what.

- 9837bbb: Every component of a run now reads the same object, and it is the first parameter of every port you implement.

  ## One context, two halves

  `RunContext` is what a run is. Its durable half is the conversation — `sessionId`, the session's `metadata`, the `revision` its journal reached and the `activeAgent` answering — rebuilt from the session on every open rather than remembered between them. Its invocation half is this question and nothing else: `runId`, `startedAt`, `actor`, `signal`, `depth`, and `parent` for a delegation. It dies when the run settles.

  `SessionContext` is that durable half on its own, and `RunContext` extends it. It exists because some things happen to a conversation with no run around them: deleting a session, publishing what a commit produced, answering a lookup. A port that demanded a run there would have to be handed a fabricated one.

  ## Ports take the context first

  ```ts
  class S3ArtifactStorage extends ArtifactStorage {
    public async put(
      context: SessionContext,
      content: ArtifactContent
    ): Promise<ArtifactReference> {
      const tenant = context.metadata.find(TENANT) ?? "shared";
      // ...
    }
  }
  ```

  `ArtifactStorage` (`put`, `read`, `find`, `deleteAll`) and `SessionStorage` (`create`, `find`, `append`, `readEvents`, `delete`, `saveSnapshot`, `findSnapshot`, `saveCheckpoint`, `findCheckpoint`) take a `SessionContext`; it names the session, so no method is passed an id alongside one. `SessionStorage.findOrFail` is no longer abstract: the error every implementer wrote is the same error.

  `CompactionStrategy.compact`, `ContextSummarizer.summarize`, `AttachmentResolver.resolve`, `StructuredOutputValidator.validate` and `ToolCallObserver.requested`/`settled` take a `RunContext`. `SessionEventConsumer.consume` takes a `SessionContext`, because publication happens after the commit from a publisher that outlives every run.

  `PricingSource.priceOf` is now `findPrice(context, model)`, and its context, like `PricingNoticeSink.report`'s, may be absent: an embedding asked for outside a run has a model and a usage but no conversation. `ConsumerNoticeSink.report` is the same for a consumer that fails while being flushed at shutdown. `LlmModel.generate`/`stream` are unchanged, because a provider is given a `ModelRequest` and never a conversation.

  `ToolContext` now carries the session's `metadata` and answers `toSessionContext()`, so a tool reads what every other component reads.

  ## Nothing keeps it

  A service receives the context as a parameter and forgets it when the method returns. Two runs share one service instance, so a field would be one run reading what another is doing, and a spec walks `runtime/` to keep that true. A tool that writes session metadata is visible to the later calls of its own run, because the fold moves on the commit that carried the write and the scope answered by that commit is the one the rest of the run reads.

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

- 732ac7e: The work moved inward, and the surface got smaller.

  A use case is now a sequence of awaits on services. What it used to do itself moved to the module that owns it: `ModelService` answers which model runs a command and refuses an attachment the model cannot read; `ToolService` opens a run's tool sources and closes them however the run ends; `SessionOpener` answers with the conversation _and_ the agent that owns it now; `NestScanService` is the one door onto reading a finished NestJS container.

  `ConsumerNoticeSink` is now **`ConsumerFailureSink`**, which is what it reports. Rename the import; nothing else about it changed.

  The three sinks are one family. `ContextNoticeSink`, `ConsumerFailureSink` and `PricingNoticeSink` now extend the exported `NoticeSink<T>`, so a sink written against one reads like a sink written against any of them. Existing implementations keep working: each sink is still its own abstract class with the same `report`.

  `ExplainAgentUseCase.attempt` is gone. `execute` was always the public path; a run that fails now fails to the caller instead of answering with half its snapshots.

  `AdkAgent` no longer copies `AgentHandle` method by method: it _is_ a handle, bound by the module after NestJS has built it. `this.support.ask(...)` is unchanged, and a verb added to the handle reaches an injected agent class without being copied. It also answers `name`, as a handle does.

  `@wirely/core` is no longer a dependency. The composition it held resolved nothing: every provider was a value the composition had already built.

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

- 627334b: The path without NestJS: one call to a running runtime, one defaults table behind both entry points, and a module that takes a plain object.

  ## `createAdkRuntime`

  The runtime never asked a container for anything, and now it is reachable without one. Agents in, a started runtime out:

  ```ts
  const adk = await createAdkRuntime({ agents: [support] });
  const answer = await adk.findAgent("support").ask("where is order 42?");
  await adk.stop();
  ```

  What comes back is a `StartedAdkRuntime`, and it answers `AgentHandle`s rather than repeating their verbs: `findAgent` gives the same handle a NestJS application injects, so `ask`, `stream`, `approve`, `reject` and `delegate` are the same thirteen methods in both worlds instead of two copies that drift. `agents` lists one per declared agent, `runtime` is everything a handle does not cover, `composed` is what the runtime was built against, and `stop` drains the runs still going.

  `storage`, `artifacts`, `clock`, `ids`, `runtime` and `exposed` are the same names `AdkModule` takes, and `runtime` is the `RuntimeOptions` patch rather than built options.

  ## One defaults table

  `RuntimeDefaults` is where the in-memory session storage, the in-memory artifact storage, the system clock and the random id generator are decided, and both entry points read it. `adk.module.ts` no longer holds a copy, so the same application cannot store conversations in one place under NestJS and in another without it.

  `AdkRuntime.start` takes an input object instead of seven positional parameters, and accepts an `AgentDefinition` directly where it used to demand a `DeclaredAgent`.

  ## A module declared with an object

  `AdkModule.forRoot({ defaultModel })` is the form to write, and `AdkModuleOptions.from` is applied internally. An `AdkModuleOptions` instance is still accepted, and so is either form from a `forRootAsync` factory. `AdkModuleOptions.runtime` takes the `RuntimeOptionsPatch` literal as well as built `RuntimeOptions`, so a module declaration reads as data:

  ```ts
  AdkModule.forRoot({
    defaultModel: flash,
    storage: new SqliteSessionStorage(connection),
    runtime: { tools: { approvals: EffectApprovalPolicy.never() } },
  });
  ```

  ## Exported

  `createAdkRuntime`, `AdkRuntimeInput`, `StartedAdkRuntime`, `RuntimeDefaults`, `AdkRuntimeStartInput`, `RuntimeComponents`, `DeclaredAgent`, `AgentDefinitionInput`, `AgentExecutionPolicies`, `AgentTransferPolicy`, `AgentDelegationPolicy`, `SkillDefinition`, `AskInput`, `AskInputParams`, `ApproveInput`, `RejectInput` and `DelegateInput`.

  `AgentHandle`, `AgentNotBoundError` and `RandomIdGenerator` moved out of `public/nest`, since none of them knows the framework. The names and the entry point are unchanged.

- 5e1f86f: Artifacts a model can ask questions of: paged reads, an outline, a search and a pointer, a SQLite store for the bytes, and a boot notice when they would not survive a restart.

  ## A placeholder used to be a dead end

  A tool answered with forty thousand characters, the runtime moved it out of the context, and the only way back was `read_artifact`, which handed the whole thing back. The model either paid for the result it had just been spared, or worked from a placeholder. Both are bad answers to "what is the total on order 42".

  `read_artifact` now pages:

  ```jsonc
  // read_artifact({ artifactId: "a-1", offset: 0, limit: 2000 })
  {
    "artifactId": "a-1",
    "offset": 0,
    "text": "…",
    "totalCharacters": 40000,
    "hasMore": true,
    "nextOffset": 2000
  }
  ```

  The page nobody asks for is the offload threshold itself, which is exactly the largest answer the runtime was willing to leave in a context. A page past the end is empty rather than an error, because "where does it end" is a question the model asks by reading, and one that has to guess an offset to avoid a failure will guess.

  **Breaking:** `read_artifact` answered a bare string and now answers that object.

  ## Three more tools, and a policy that decides which apply

  `outline_artifact(artifactId, depth?)` says what is in there: for JSON the keys, the types and the length of every array down to `depth` (2 by default); for text the lines, characters, bytes and how it starts. `search_artifact(artifactId, query, regex?, maxMatches?, context?)` says where something is, with the line and the characters around each hit. `query_artifact(artifactId, pointer)` reads one value out by RFC 6901 JSON Pointer.

  All three are internal like `read_artifact`, so no approval policy applies to them, and all three resolve an id inside the session that asked.

  Which of them a placeholder offers is a decision rather than a fact about the bytes. `OffloadPolicy` gains `decide(characters, mediaType)`, answering `OffloadDecision.INLINE`, `OPAQUE` or `EXPLORABLE`, and the placeholder says so:

  ```text
  [artifact a-1, application/json, 40000 characters, read with read_artifact(artifactId, offset, limit), or explore with outline_artifact, search_artifact and query_artifact]
  ```

  `CharacterCountOffloadPolicy` calls JSON and `text/*` explorable and everything else opaque, because offering tools over content they cannot parse is a call spent being told no.

  **Breaking:** `OffloadPolicy.shouldOffload` was abstract and is now a concrete method read off `decide`, which is the one abstract member. A policy of your own implements `decide`.

  ## Every answer is budgeted, and nothing is evaluated

  Each answer is fitted to the offload threshold before it is returned, which is what stops the recursion: without it, a tool written to help a model read something too large to read would produce something too large to read, be offloaded, and hand back a placeholder describing a placeholder. Fitting is by dropping and it is always declared as `truncated: true`, because a model told it saw everything and did not will act on the half it was shown.

  `query_artifact` takes a pointer and only a pointer. JSONPath filters are an expression language, and an expression language whose source is a string the model wrote is code execution with extra steps. `search_artifact` is a literal string unless `regex: true`, and then the pattern goes through a guard that refuses a quantifier on a group that itself repeats or branches, a backreference, lookaround, a repetition over 100, and anything over 200 characters. A refused pattern comes back as `{ refused: true, reason }` the model can correct, never as a failed run.

  ## SqliteArtifactStorage, and a notice when there is none

  ```ts
  const connection = new SqliteConnection("store.db");

  AdkModule.forRoot(
    AdkModuleOptions.from({
      defaultModel,
      storage: new SqliteSessionStorage(connection),
      artifacts: new SqliteArtifactStorage(connection),
    })
  );
  ```

  The two belong together. A journal is durable and an in memory artifact store is not, so a conversation restored after a restart names artifacts nothing can resolve, and the model reads a sentence about content it has no way to reach. Two processes have the same problem without waiting for a restart.

  So a runtime composed to offload into `InMemoryArtifactStorage` now reports `ArtifactsNotDurable` through `ContextNoticeSink` at boot, from both `AdkModule` and `createAdkRuntime`. It is a notice and not a refusal, because one process is a correct way to run a script, a test or a container, and there is no logger behind it: declare the sink and you hear it, declare nothing and the library stays quiet.

  **Breaking:** `ContextNoticeSink` now receives `ContextNotice`, which is `ContextWindowUnknown | ArtifactsNotDurable`. A sink that read fields off `ContextWindowUnknown` narrows with `instanceof`; one that reads `message` is unchanged.

  ## ArtifactStorageContractSuite

  `@nestjs-adk/testing` gains the suite, beside the session one and driven the same way:

  ```ts
  const suite = new ArtifactStorageContractSuite();
  for (const contract of suite.cases(() => new S3ArtifactStorage(client))) {
    it(contract.name, () => contract.run());
  }
  ```

  It demands the two guarantees the port is written about: what comes out of `read` is what went into `put`, verified against the digest, and a session only ever reads its own, with anything else absent rather than refused. Both shipped stores answer the same cases, in one loop.

- ae5b34e: An artifact has a name, and it is either text or bytes.

  ## Text or bytes, decided at construction

  `ArtifactContent` no longer has a public constructor. `ArtifactContent.fromText(text, mediaType?, name?)` is what it used to be; `ArtifactContent.fromBytes(bytes, mediaType?, name?)` and `fromBase64(base64, mediaType, name?)` keep bytes as base64 and say so through `encoding` and `isText`. `characters` counts text and is zero for bytes; `bytes` counts both.

  The reason is `outline_artifact` on an image. An attachment was stored as base64 text under `image/png`, and the outline answered `kind: "text"`, one line, starting with `iVBORw0KGgo`. Every artifact tool now asks `isText` first and answers `{ refused: true, reason }` for bytes, the same shape `RegexGuard` gives a pattern it turns down, because asking is an ordinary mistake the model corrects. `ArtifactReference.isText` and `bytes` carry the same fact to whoever holds only the reference, and the placeholder says `not readable by a tool` instead of offering `read_artifact`.

  ## A name is a value object

  `ArtifactName.fromText` refuses an empty name, one over 160 characters, a control character and a square bracket, with `InvalidArtifactNameError`. A file name comes from an end user and ends up in the placeholder line the model reads, so `report.md] [artifact a-9` is an injection and not a file name. Nothing resolves an artifact by name; two may share one.

  The placeholder shows it: `[artifact a-1 "sales.csv", text/csv, 912340 characters, ...]`. Three files attached to one question used to read as three identical lines.

  **Breaking:**

  - `new ArtifactContent(text, mediaType)` is `ArtifactContent.fromText(text, mediaType)`.
  - `ArtifactReference.restore` takes one params object (`{ id, sessionId, digest, mediaType, characters, bytes?, isText?, name? }`) instead of five positional arguments.
  - `ArtifactStorage` keeps two more facts: what comes out of `read` and `find` carries the `encoding` and the `name` that went into `put`. `ArtifactStorageContractSuite` gains "keeps the name it was given" and "gives bytes back as bytes"; an adapter that stores text only fails the second. `SqliteArtifactStorage` adds the columns to a file written by an older build on open, and marks its `image/*` rows as bytes.

- ae5b34e: A file the model reads rather than looks at: `.md`, `.csv`, JSON and any text arrive as an artifact, and the artifact tools are how the model gets at them.

  ## Two doors in

  ```ts
  await agent.ask("summarize the report", {
    files: [
      ArtifactContent.fromText(
        markdown,
        "text/markdown",
        ArtifactName.fromText("q3.md")
      ),
    ],
  });

  const reference = await agent.attachArtifact(
    sessionId,
    ArtifactContent.fromText(csv, "text/csv", name)
  );
  await agent.ask("what is the total in column b?", {
    sessionId,
    attachments: [reference],
  });
  ```

  `AskOptions.files` stores each file under the session and journals the reference with the question, the way `media` already did for an image. `attachArtifact` stores one outside a question, for an application that uploads first and asks later; it refuses a session nobody opened with `SessionNotFoundError`. Both are `AskInput.files` and `SessionService.attachArtifact` underneath.

  ## The fourth projection

  `AttachmentProjection.artifact()` joins `media`, `note` and `omit`. It asks the runtime to write the placeholder an offloaded result gets, with the name, the type, the size and the tools that apply under the offload policy, so a `.csv` is read with `read_artifact`, `outline_artifact`, `search_artifact` and `query_artifact` instead of being pasted into the prompt. `DefaultAttachmentResolver`, `InlineAttachmentResolver` and `SignedUrlAttachmentResolver` all answer it for a stored artifact that is text.

  Before it existed a text attachment failed `MediaPart.image` inside `load`, the failure was swallowed, and the projection was `omit`: the file vanished with no line saying so.

  ## The type travels with the reference

  `AttachmentReference.artifact(id, mediaType)` carries the media type like `link` and `external` always did, and `isImage`, `isReadableArtifact` and `needsMediaInput` read it. `ModelService` now refuses a model without `MEDIA_INPUT` only for an image: a text artifact handed to an agent on a text-only model runs, because the model reads it through a tool. A reference written before the type travelled is treated as an image, which is what every stored attachment was.

  **Breaking:**

  - `AttachmentResolver.resolve` takes a `RunContext`, as the changeset that introduced `RunContext` said it did. An implementation that declared `SessionContext` keeps compiling.
  - `UserMessageReceived` and `ToolResultProduced` are at schema version 6, carrying `mediaType` beside a stored attachment's `id`. Rows written by older builds keep decoding; rows written by this build are refused by older builds.
  - `AttachmentStore.store` takes a fourth list, the files, and `AttachmentStore.attach` is new; `SessionService` takes an `AttachArtifactUseCase`. Both reach only code that composes the runtime by hand.

- ae5b34e: A model can ask what files it has.

  `list_artifacts` joins the artifact tools. It takes nothing and answers the session's artifacts, newest first: id, name, type, size, and which tools read each one under the offload policy. It exists because the only ids a model knew were the ones it had seen in a placeholder, and a file attached before the conversation was compacted, or attached outside a question, had no line left to be seen in. Like the others it is `internal`, resolves inside the session that asked, and fits its answer to the offload budget. It stops at a hundred entries and says `truncated`.

  **Breaking:** `ArtifactStorage` gains `list(context, limit)`, abstract. It answers the session's references, newest first, never more than `limit`, and an empty list for a session that owns nothing. `ArtifactStorageContractSuite` gains "lists only what the session owns, newest first, up to the bound". The two shipped stores implement it; an adapter written outside this package has to.

- ae5b34e: Every policy applies to every tool, and the exemption that said otherwise is gone.

  `ToolDefinition.internal` marked a tool the runtime offers on its own behalf, and one flag bought it three exemptions: the access policy was not asked, the approval policy was not asked, and the result was never offloaded. It was added for one honest reason, which is that a policy written for an application's tools should not leave a model unable to read a file it was told to read. It paid for that by putting a hole in two security decisions, and the hole was wider than the reason.

  The rule now has no exception. `AdkAccessPolicy.decide` is asked about `read_artifact` exactly as it is asked about a tool you wrote, `AdkApprovalPolicy.requires` is asked about every call of every turn, and every result goes through the offload policy.

  **Breaking:** `ToolDefinition.internal` is removed, along with the sixth constructor parameter that set it. `ToolCallNotice.isInternal` and `ToolResultNotice.isInternal` are removed with it. An observer that used them to keep the runtime's own calls off a screen names the calls it hides, by `toolName`, which says what it means instead of leaning on a flag that also decided who may call what.

  **This changes who may transfer and delegate.** `transfer_to_agent` and `delegate_to_agent` carried the flag and were exempt from the access policy. They are not any more, so an `AdkAccessPolicy` that refuses unless it recognises the tool now refuses those two and has to name them. Both declare `read`, so `EffectApprovalPolicy.destructiveOnly()`, the default, still holds neither. `activate_skill` never carried the flag and is unchanged.

  What replaces the offload exemption is arithmetic. Every answer the runtime's own tools produce is fitted to `ArtifactBudget` before it is returned, so `OffloadPolicy.decide` answers inline on its own and an answer about an artifact does not become a second artifact. That needed a real fix rather than a claim: `ArtifactPage.toResult` was never measured, so a full `read_artifact` page was `threshold` characters of text **plus** the JSON frame around it, and the moment the exemption went every complete read would have offloaded itself. The handler now measures the answer and repaginates in a loop until it fits, giving up only when a rebuild stops shrinking the text. A single retry was not enough, on either path: cutting characters does not reliably remove that many characters of JSON, because a retry that reaches the end of the artifact adds a `nextOffset` the first build did not carry, and that addition can outweigh the cut. A line read that is still over budget after fitting degrades to a page addressed by character at the start of the requested line, which carries no line fields at all, so it cannot answer over budget by claiming to hold a whole line it does not.

  The invariant is worth stating plainly, because it is arithmetic and not a special case: the budget is `max(threshold, 1000)`, and offload triggers strictly above the threshold, so at any threshold of a thousand or more an answer that fits the budget is left inline. One corner is documented rather than hidden: below a threshold of a thousand the floor sits above it and a runtime answer can be offloaded once; that is bounded rather than broken, since the next level holds at most a page of the threshold plus a frame, and `RunLimits.maxIterations` ends the run in any case.

- ae5b34e: An artifact changes in place, and the reference you read is the lock on it.

  `ArtifactStorage` gains `update(context, reference, content): Promise<ArtifactReference>`. It replaces what one artifact holds while keeping its id and its position in the session's list, and both halves of that matter. The id is already written into placeholders the conversation cannot take back, and re-listing an edited file first would reorder what `list_artifacts` shows every time a model fixes a typo.

  The `reference` you pass is the one you read, and its digest is optimistic concurrency. The store compares it with what it holds now and throws `TamperedArtifactReferenceError` when the two disagree, so a writer working from a version somebody else has since replaced is refused instead of overwriting them. Writing is scoped like reading: a reference from another conversation answers `ArtifactNotFoundError`, and nothing is written.

  Mutating content that a durable journal points at sounds unsafe, and it is not, because the journal never persists a digest. `AttachmentReferenceCodec` writes the artifact id and at most the media type, and every read path re-finds the reference through `ArtifactStorage.find` before reading it. So there is no stored digest anywhere that an edit could invalidate, and the digest check only ever compares a reference read in the same turn.

  The cost is a sentence rather than a corruption, and it is worth knowing: a placeholder already written into `ToolResultProduced` still quotes the character count the artifact had then, and nothing rewrites a past event. That is why `edit_artifact` answers with the new size, so the turn that changed the file also states the number that is now true.

  **Breaking:** `update` is abstract. An `ArtifactStorage` written outside this package does not compile until it implements it. That is deliberate rather than a default that throws: a default would split stores into ones that can be edited and ones that cannot, with nothing in the types saying which you have, and the application would find out when a model called `edit_artifact` in production.

  `ArtifactStorageContractSuite` gains three cases for it. An update keeps the id and the place in the list; a stale reference is refused and leaves the content the accepted write put there; and one session cannot update another's even holding the right reference. `InMemoryArtifactStorage` and `SqliteArtifactStorage` answer all three in the same loop as the rest.

- ae5b34e: A tool name the runtime owns is refused at boot, instead of being taken back on every run.

  The runtime appends its own tools to a catalog after whatever the agent declared, and a catalog keys tools by name with the last entry winning. So an agent that declared a tool of its own called `read_artifact` never had it. The model was offered the runtime's tool under that name, the handler the application wrote was never called, and nothing said so anywhere: no error, no notice, no line to grep for. Losing a tool this way is worse than failing, because the run still finishes and answers with something nobody wrote.

  `AgentCatalogBuilder.add` now refuses it. An agent that declares a tool of its own under a name the runtime owns raises `DuplicateRuntimeToolNameError`, code `CATALOG_DUPLICATE_RUNTIME_TOOL_NAME`, carrying the tool name, the agent name and the provider that declared it. Both entry points walk through that builder, so `AdkModule` and `createAdkRuntime` refuse the same declaration in the same way, at boot, once, at the place the mistake was written.

  The reserved set is every name the runtime binds, and not only the tools an agent asked for:

  ```text
  read_artifact, list_artifacts, outline_artifact, search_artifact, query_artifact, slice_artifact, edit_artifact,
  activate_skill, transfer_to_agent, delegate_to_agent
  ```

  Reserving only what an agent listed would protect the wrong half. An application that lists `SearchArtifactTool` and then writes a `search_artifact` of its own has at least read that the name is taken. The names nobody lists are the dangerous ones: `read_artifact` is handed to every agent that has tools at all, and the runtime adds `activate_skill`, `transfer_to_agent` and `delegate_to_agent` to the catalog by itself. Those four are exactly the names an application collides with by accident, because it never wrote them down.

  The set reads each name off the class that declares it, so a tool that renames itself cannot leave a stale literal behind in the guard. Asking for a runtime tool is unchanged: `SearchArtifactTool.request()` answers a `RuntimeToolRequest`, and a request that shares the name of the tool it stands for is the opt-in mechanism working, so the check skips it.

  The last three reach a catalog only when the agent has an on-demand skill, a transfer edge or a delegation edge, and they are reserved unconditionally all the same. Reserving them only where the edge exists would mean an application's own `transfer_to_agent` works, for months, until somebody adds one transfer target to that agent. The boot would then break on a tool file nobody touched, for a reason with no visible link to the edit that caused it. Failing always is easier to act on than failing later.

  **Breaking:** an application that declared a tool of its own under one of those ten names booted before and does not now. The message names the provider and the tool. To get the runtime's tool, list the class; to keep yours, rename it.

### Minor Changes

- d00a048: A run can be stopped by whoever asked for it, and an agent can declare how long it may run.

  ## The stop button

  `AskOptions` and `DecisionOptions` take a `signal`. Everything under the surface was already there: each run owns a cancellation, its signal reaches the tools and the model call, the provider adapters hand it to the SDKs, and the journal already writes a cancellation when a cancelled run ends. What was missing was the way in, so nothing an application held could stop one run.

  Without it the best an application could do was stop reading the stream. The generator gets its `return()`, the interface stops showing text, and the run carries on inside the provider to the end: tokens generated and billed after the customer walked away, and a journal that closes the run as completed.

  ```ts
  const controller = new AbortController();
  request.on("close", () => controller.abort());

  await support.ask("where is my order?", {
    sessionId,
    signal: controller.signal,
  });
  ```

  The signal is chained onto the run the way a delegation already chains onto its parent, so a cancelled run takes its children with it. One that has already aborted cancels the run before it calls anything, which is the moment the button is usually pressed: before the first chunk. `approve` and `reject` take one too, because a released turn is a run of its own, and a decision made minutes later deserves the same stop button.

  ## Limits an agent declares

  `AgentDefinition.limits` existed and the scope factory read it, but nothing ever filled it: discovery passed `undefined` into that slot and `AgentOptions` had no field for it. An agent that needed more round trips than the rest of an application had no way to say so, and the application had to raise the module limit for every agent it had.

  ```ts
  @Agent({
    name: "sales",
    description: "Catalog, prices and quotes.",
    limits: new RunLimits(16),
  })
  export class SalesAgent extends AdkAgent {}
  ```

  Two documents said the levels narrow each other and that nothing widens what a level above decided. The code has always replaced, field by field, which is the behaviour kept here: an agent that declares sixteen iterations gets them even when the module said eight. A sector that genuinely runs longer is the reason the field exists, and capping it would leave the ceiling being raised for everyone instead. The README paragraph and the scope factory's documentation now say that.

  `AdkAgent.approve` and `AdkAgent.reject` reach the same options object the handle takes, so a decision made through the class can declare the tool sources the resumed run needs. A plain name still works where the options object goes.

- d00a048: Every run answers what it cost, and an embedder is injectable.

  Declare one pricing source in the module and `AgentResult.cost` is filled on every run:

  ```ts
  AdkModule.forRoot(
    AdkModuleOptions.from({
      defaultModel,
      runtime: RuntimeOptions.from({
        cost: { pricing: new LiteLLMPricingSource() },
      }),
    })
  );

  const result = await support.ask("where is my order?");
  result.cost.total.toString(); // "0.0000088"
  result.cost.byModel[0]?.usage.totalTokens; // 52
  result.cost.isComplete; // true
  ```

  Money is an exact integer of pico dollars in a `bigint`, and that unit was measured rather than picked: of the 5345 rates LiteLLM publishes, a nano unit truncates 103 of them and reads the cheapest as zero. `toString()` is the exact decimal a `NUMERIC` column wants, `toNumber()` is documented as lossy, and `toJSON()` answers the string so a controller can return a result unchanged.

  Each call is billed to the model that served it, so a reroute lands on its own line in `byModel`. A delegation's cost joins the parent's total once, with the child's model listed separately.

  Nothing about a bill can fail a run. A model the source does not know, a source that throws, a provider that reported no tokens, a catalog that is down: each one leaves the model named in `cost.unpriced`, its tokens out of the total, `isComplete` false, and a `ModelUnpriced` at the notice sink. Declaring no source at all does the same, so a zero is never mistaken for free.

  `LiteLLMPricingSource` reads the community catalog when the first run asks for a price and serves it from memory for a day. A read that fails keeps the table already loaded and is not retried until the retry window passes. Write your own `PricingSource` for negotiated rates or a persisted catalog: returning `undefined` is a normal answer.

  `Embedder` is now resolved by the container:

  ```ts
  AdkModule.forRoot(
    AdkModuleOptions.from({ defaultModel, embedder: new GeminiEmbedder() })
  );

  @Injectable()
  export class SearchService {
    public constructor(private readonly embedder: Embedder) {}
  }
  ```

  An application that declares none still boots and still injects: only code that embeds fails, and it names the option to declare. `PricedEmbedder` prices an embedding through the same source, and an embedder that reports no usage lands in `unpriced` rather than having its tokens guessed from characters.

  `@nestjs-adk/testing` passes the cost through: `RecordedRun` rebuilds the result rather than wrapping it, and was dropping the new field, so every run in a test read a cost of zero.

  **Breaking:** `AgentResult` takes a sixth constructor argument, `ModelCost.of` and `ModelCost.including` take the usage, `AgentHandle.approve` and `AgentHandle.reject` take an options object where they took a name (a plain name still works), and `SystemClock` moved to `common/time` (the import from `@nestjs-adk/core` is unchanged).

- f9bd943: Who is calling, who may, and the same answer for an MCP client.

  A tool that reads a person's data needs to know which person, and the run never did. `ask`, `approve` and `reject` now take an `actor`, an id and claims the runtime never reads, and every tool of the run receives it as `context.actor`, handovers and delegations included.

  ## An access policy, asked on every path

  `AdkAccessPolicy.decide(tool, invocation, actor)` is asked before every invocation, after the arguments were parsed and before any approval is requested, so nobody approves a call the actor could not make. A refusal reaches the model as the tool's result, with the policy's reason. Declare it on `RuntimeOptions.tools.access`; without one, `OpenAccessPolicy` grants everything, which is what an application that wrote none meant.

  ## What a class publishes

  `@McpController({ tools })` declares what is served to MCP clients in the shape `@Agent({ tools })` declares what a model is offered: shared `@Tool` classes listed, `@Tool` methods on the class itself as client-only tools. A class an agent and a controller both list is one tool. A name two controllers publish fails the boot with `DuplicateExposedToolError`, naming both.

  ## The server

  `McpServerModule.forRoot({ path, name, version, actors, imports, decorate })` in `@nestjs-adk/mcp` serves what the controllers published at one path, over stateless streamable HTTP. `actors` is the application's `McpActorResolver`, which turns a request into an actor or throws `McpUnauthorizedError` with the `WWW-Authenticate` challenge to write back. Every call walks the core's own `ToolGate`, so an outside client cannot do what the agent could not, because both go through one code path.

- f9bd943: The approval policy knows who is asking, and an agent lists a tool by name.

  `AdkApprovalPolicy.requires(tool, invocation, actor)` receives the run's actor as a third argument, so a policy can let one person run what another has to confirm. `EffectApprovalPolicy` ignores it; a policy written before this release keeps compiling, since the argument is optional and unread.

  `@Agent({ tools })` and `@McpController({ tools })` accept the name a tool declared beside its class. Both resolve to the same definition through `SharedToolLookup`, and a name nobody declared fails the boot with `UnregisteredToolError`, naming what was found. The string exists for the module that cannot import the class without closing a cycle.

- f9bd943: A thinking model's reasoning comes back with the call it led to.

  DeepSeek streams `reasoning_content` ahead of a tool call and refuses the next request of the same turn unless the assistant message replaying the call brings it back. The refusal is a 400 the failover policy correctly stops on, so an approved call resumed a turn later died as `ModelsExhaustedError` naming a malformed request.

  The OpenAI adapter now gathers the reasoning of one stream in an `OpenAiReasoningTrace` and hands it to the first tool call that opens, as that call's signature: the opaque slot a provider's own bookkeeping already had. It never reaches the answer's text. On the way back, `OpenAiRequestMapper` folds calls the model made in one breath into one assistant turn with several `tool_calls`, which is the shape it produced them in, and sets `reasoning_content` on that turn when a call carries a signature. The turn also carries `content: ""`, which DeepSeek's validation expects on the message it returned; the field missing was refused with the same error as the reasoning missing.

  ## Calls made in one breath stay together

  `ContextProjector` used to give every call its own block, the result folded in behind it, so three calls the model made at once were read back as three assistant turns, each answered before the next was asked. Every provider produced them as one turn with three calls, and a thinking model attaches its reasoning to that one turn: split, two thirds of them were turns it never reasoned about, and DeepSeek refused the request. Calls requested back to back with nothing conversational between them now share one `ContextBlock`, calls first and results after all of them, closed when the last is answered; `ContextBlock.alsoCalling` is how the block grows. Compaction's unit is unchanged: the breath is still the smallest thing that may be dropped or kept.

  `OpenAiOptions.replaysReasoning` decides whether it is sent. Unset, it follows `baseURL`: a compatible endpoint gets it and the official API, which refuses a message field it does not know, does not.

- f9bd943: A refused call is answered as a refusal, not as an error.

  A call the person denied, or the access policy refused, used to reach the model as `{ error: "<reason>" }`, the same result a tool that broke produces. A model cannot tell the two apart on the wire, and it behaves like it was told of an error: it explains a fault it never saw and retries, while the prompt is asking it to say the action was refused. Both now produce `{ refused: true, reason }`, still marked failed so the model does not ask again. `ToolOutcome.refused` is the factory, next to `failed`, and `{ error }` keeps meaning what it meant: the call ran and broke, or the arguments were invalid.

  An application that read `output.error` off a denied call reads `output.reason` now.

- f9bd943: The two journal events an application listens for are public.

  `ToolCallRequested` and `ToolResultProduced` are exported, so a consumer of `PublishedEvent` matches `event.type` against `ToolCallRequested.TYPE` instead of a string it copied from the codec registry. The class already carries its name; the application no longer has to.

- f9bd943: The tool calls of a run can be watched by whoever asked the question, and a prompt built per run knows who is asking.

  ## `toolCalls` in `AskOptions` and `DecisionOptions`

  A run announces its tool calls through the journal, and a `SessionEventConsumer` is how something outside the run reads that. What the code that asked the question had was less: `stream` yields what the model said, and the runtime's tool lifecycle (which tool, with what effect, held for a decision or not, and what it answered) reached it only by registering a global consumer at module boot, keying a map by session id to find the caller, and re-typing a payload the runtime had already typed.

  `ToolCallObserver` is the other side. It travels with the call, lives as long as the call does, and is told twice per tool call:

  ```ts
  class ToolCards extends ToolCallObserver {
    public async requested(call: ToolCallNotice): Promise<void> {
      await this.cards.draw(
        call.callId,
        call.tool?.description,
        call.effect,
        call.isHeld
      );
    }

    public async settled(result: ToolResultNotice): Promise<void> {
      await this.cards.finish(
        result.callId,
        result.output,
        result.isRefused ? result.reason : undefined
      );
    }
  }

  const run = support.stream(message, {
    sessionId,
    actor,
    toolCalls: new ToolCards(cards),
  });
  ```

  `requested` arrives after the gate has screened the turn and before anything of it runs, with the `ToolDefinition` the call named and `isHeld` as the gate decided it. That verdict is the point: an application that showed a button on a held call used to ask the approval policy a second time, from outside the run, and two answers to one security question is one too many. `settled` follows each result, whether the tool answered, failed, or was refused by the person asked, and `ToolResultNotice.isRefused` tells the last two apart.

  A held call is requested once, in the run that suspended, and settles in the run that released it, which is why `approve` and `reject` take an observer too. Nothing about it is stored: a decision made minutes later, on another instance, brings its own, and the turn it releases was in the journal all along.

  `requested` is awaited before the turn runs, so an observer that writes a row for a call has written it by the time the result arrives. An observer that throws ends the run, the way any other failure in the caller's own code would; a delegated child tells the parent's observer nothing, the way its chunks reach nobody.

  `ToolOutcome` is exported, since a `ToolResultNotice` carries one.

  ## `PromptContext.actor`

  `prompt()` received the session's owner and not the caller's actor, so a prompt that names a workspace or a role had to keep the actor's claims in a map keyed by session id, filled before `ask` and emptied after. The actor is now on the context, the same one every tool of the run receives, so what the instruction says and what the tools may do read the same claims.

  ```ts
  protected override async prompt(context: PromptContext): Promise<string> {
  	return this.prompting.renderFromFileOrFail("assistant.md", {
  		workspaceId: context.actor?.claims.workspaceId,
  	});
  }
  ```

  The owner stays what it was: whose conversation this is, remembered by the session. The actor is who is asking now.

- ae5b34e: Reading an artifact the way a person reads a file: by line, case insensitively, counted honestly, outlined by what it is, and sliced when it is a table.

  ## `read_artifact` reads by line

  `search_artifact` always answered with the line of each match, and `read_artifact` only took a character offset, so the model was handed a number it could use for nothing. `fromLine` and `lines` close that: `read_artifact({ artifactId, fromLine: 212, lines: 40 })` answers the lines, `totalLines`, and `nextLine` when there are more. `limit` still caps the characters, so one long line cannot blow the budget.

  ## `search_artifact` grows three things and loses one lie

  - `caseSensitive: false` finds `Error` with `error`. It is the one flag the model may ask for; `RegexGuard` still builds the expression.
  - `mode`: `excerpts` as before, `lines` for the whole line of each match, which is what a grep shows, and `count` for the number alone, spending nothing on excerpts.
  - `totalMatches` counts every occurrence, up to `SearchArtifactTool.MAX_COUNTED_MATCHES` (10 000), and `countStopped` says when it hit that. Before, both the literal and the pattern search stopped at a hundred, so an artifact with two hundred hits reported exactly a hundred as the total.

  ## `outline_artifact` knows a table and a document

  The outline is decided by parsing, in the order JSON, CSV, Markdown, text, and never by the declared type. A CSV answers its columns, each with a type read from its values (`integer`, `number`, `date`, `boolean`, `text`, `empty`), how many were blank and a sample, plus the row count. A Markdown document answers its headings with their level and line, which is the table of contents that makes a long one navigable. Quotes, escaped quotes and line breaks inside a quoted cell follow RFC 4180.

  ## `slice_artifact`

  A rectangle of a CSV: `fromRow`, `toRow` (1 is the first row under the header) and `columns` by name, in the order named. A slice and never a query, for the same reason `query_artifact` takes a pointer and not a JSONPath: there is no filter and no expression, so a string the model wrote cannot compute anything. A column that is not there is refused with the list of the ones that are; text that does not read as a table is refused pointing at `read_artifact`.

  The placeholder and `list_artifacts` name it beside the other four.

- ae5b34e: An artifact larger than the tools will load, and a page that never loads the whole thing.

  `search_artifact` runs `matchAll` over the whole text, and `outline_artifact`, `query_artifact` and `slice_artifact` parse all of it. That is fine for what a conversation produces and wrong past a few tens of megabytes. `RuntimeOptions.context.maxExplorableCharacters` (twenty million by default) is the largest artifact those tools load whole; above it they answer `{ refused: true, reason }` naming the ceiling and the way out, before reading a byte.

  The way out is `read_artifact` by character range, which no longer loads the artifact at all. `ArtifactStorage.readRange(context, reference, offset, length)` is a new method with a default implementation that reads and slices, so every adapter has it; `SqliteArtifactStorage` overrides it with `substr` inside the database. `ArtifactStorageContractSuite` gains "reads a range of what it holds", which holds an override to the same characters a full read gives. Reading by line still loads the whole text, because line starts are not known without it, and is under the ceiling.

- ae5b34e: An agent asks for the tools it reads files with, and a declaration stops being a tax on every agent.

  Six tools reached every agent that had any tool at all, and five of them were of no use to an agent nobody ever sends a file to. A tool declaration is prompt paid on every turn: the six measure 5 524 characters of name, description and schema, and `ContextMeasurer` counts all of it in the prefix. Now `read_artifact` is the only one every agent gets, because a placeholder naming an artifact no tool can open is worse than no attachment, and the other five are listed on the agent that needs them:

  ```ts
  @Agent({ name: "analyst", description: "...", tools: [LookupOrderTool, ...ArtifactExplorationTools] })
  @Agent({ name: "importer", description: "...", tools: [OutlineArtifactTool, SliceArtifactTool] })
  ```

  `ListArtifactsTool`, `OutlineArtifactTool`, `SearchArtifactTool`, `QueryArtifactTool` and `SliceArtifactTool` are exported, and `ArtifactExplorationTools` is the five together for an agent that should open whatever it is handed. Listing the class does not instantiate anything: it declares a `RuntimeToolRequest` carrying the name, the description and the schema the model reads, and the runtime swaps it for the tool bound to the store it composed when it builds the catalog for the run. So the declaration lives once beside the code, and an application never holds the artifact store, the offload policy or the budget to get a tool that uses them. Outside a container, `SearchArtifactTool.request()` goes straight into `AgentDefinitionInput.tools`. The swap is by name, and a `RuntimeToolRequest` in the list is what says which names to swap. `RuntimeTools.bind` reads the names off the declared requests, selects the bound tools by those names, and the catalog keys every tool by name with the last entry winning. So a tool of your own called `search_artifact` is left alone when you did not also list `SearchArtifactTool`, because nothing asked for that name. List both and the runtime's tool is added last and silently wins. A request that reaches a model no runtime bound it for raises `UnboundRuntimeToolError` instead of answering something wrong.

  This changes what an existing agent is offered. An agent that was relying on `outline_artifact`, `search_artifact`, `query_artifact`, `slice_artifact` or `list_artifacts` has to list them now; nothing else moves, and `read_artifact` keeps working untouched.

  The prefix is also what compaction scales against. `ContextBudget.projectedTokens` is the reported input tokens times the ratio of what is about to be sent to what was sent last, and the prefix sits in both halves of it, so a larger constant prefix pulls the ratio towards 1 and compaction fires later. The six tools on every agent had moved a conversation calibrated at two percent of the window from compacting to never compacting. Five of them leaving the prefix moves it back, and `.knowledge/context-projection.md` now says why, since it is the opposite of what the arithmetic looks like it should do.

- ae5b34e: The model edits the file it was given, and every ambiguous edit is refused instead of guessed.

  `EditArtifactTool` is a seventh runtime artifact tool, opt in like the five that explore. It changes a text artifact in place, keeping its id, so the placeholder the conversation already wrote still points at the file the model just corrected. It takes `edits`, one string holding one or more git conflict style blocks, the format Aider and Cline use, so a model has seen it before:

  ```text
  <<<<<<< SEARCH
  	const timeout = 30;
  =======
  	const timeout = 120;
  >>>>>>> REPLACE
  ```

  ```ts
  @Agent({ name: "importer", description: "...", tools: [OutlineArtifactTool, SliceArtifactTool, EditArtifactTool] })
  ```

  Matching is exact and never fuzzy, indentation and line endings included. That is the whole design and not a limitation: a fuzzy match finds something near enough, writes there, and reports success, which is how an edit tool corrupts a file in silence. A refusal costs one call and the model can act on it, so every ambiguity comes back as `{ refused: true, reason }` naming the block and saying what to do. A SEARCH section that matches nothing is told matching is exact and that it should read the part it is changing. One that matches more than once is told to extend it with the lines around it until it is unique. An empty one is told the artifact already exists and there is nothing to insert against. A malformed block is named by the line it broke on and shown the shape it should have had.

  Occurrences are counted overlapping, because two overlapping positions are two places a person could have meant and collapsing them into one would pick a side. **Nothing is written unless every block applies:** the blocks run in order against a copy in memory, each against the result of the one before it, and `ArtifactStorage.update` is called once after the last one lands. A half applied edit leaves a file in a state nobody wrote. An empty REPLACE section deletes the SEARCH text, and the answer carries the new character count, because the placeholder in an earlier event still quotes the old one.

  It declares `ToolEffect.WRITE`, and that now means something, because no tool is exempt from the approval policy any more. An application whose policy holds writes holds this tool, and the change waits for a person with no code beyond the policy it already wrote:

  ```ts
  runtime: RuntimeOptions.from({
    tools: { approvals: EffectApprovalPolicy.from(ToolEffect.WRITE) },
  });
  ```

  It is deliberately **not** in `ArtifactExplorationTools`. That group stays the five tools that read. A group named for exploration that quietly carries a write is how an agent ends up able to change a file nobody meant to give it, so an agent that should edit lists `EditArtifactTool` and says so in the one place a reviewer looks.

- ae5b34e: A placeholder stops naming tools the agent reading it may not have.

  The sentence a model reads in place of an artifact used to list the exploration tools by name:

  ```text
  [artifact a-1 "sales.csv", text/csv, 13480 characters, read with read_artifact(artifactId, offset, limit), or explore with outline_artifact, search_artifact and query_artifact]
  ```

  That sentence is durable. It is written into `ToolResultProduced` and read back on every later turn, so it cannot know which agent will read it, and since those five tools became opt in it was naming tools an agent may never have been given. A model that acts on it spends a call being told the tool does not exist. It now says what it knows instead:

  ```text
  [artifact a-1 "sales.csv", text/csv, 13480 characters, read with read_artifact(artifactId, offset, limit), and its shape is one the artifact exploration tools understand]
  ```

  `read_artifact` is still named, because every agent that has tools at all has it, so that half is a promise the placeholder can keep. The rest is a fact about the content, and the model finds out what it can do with it from the tools it was actually given.

  `list_artifacts` answers on the same rule: each entry carries an `explorable` boolean where it used to carry the list of tools that applied. A durable answer describing a catalog it cannot see is a wrong answer however carefully it is written.

## 1.0.0

### Minor Changes

- 84cd3b8: Typed agent state and loop limits.

  - `state` on `@Agent`: a Zod schema validated at run entry (ask() and store hydration, before any model call) and on every write to a declared key (`ctx.state.set` / `outputKey`). Undeclared keys pass through. New `AgentStateInvalidError` and `AgentStateMissingError`.
  - `StateBag<TState>` and `ToolContext<TState>` generics (default keeps current behavior) plus `ctx.state.require(key)` for mandatory reads.
  - Opt-in loop caps: `maxIterations` (model/tool round trips per run) and `maxConsecutiveToolFailures` (per-tool circuit breaker, a success resets). Resolution: `ask()` override > `@Agent` > `forRoot({ defaults })`. Exceeding aborts the engine via signal and throws `AgentMaxIterationsError` (with aggregated usage and last requested tool) or `ToolRepeatedFailureError`.
  - Run logs: aborts always log as warn with duration and usage; breaker escalation logs at debug level.
  - Google engine: tool-call-only turns now emit `llm_response` (no text) carrying usage, so loop cost is aggregated correctly.

## 0.0.3

### Patch Changes

- 3928827: Rewritten documentation: each package now ships a complete, linear README in simple English, with the main guide living in @nestjs-adk/core.

## 0.0.2

### Patch Changes

- English package READMEs, dependency security upgrades (npm audit clean) and vitest 4 compatibility for caller-relative prompt paths.

## 0.0.1

### Patch Changes

- Primeira versão: decorators (@Agent/@Tool/@Skill/@WorkflowAgent) com registro via providers do Nest (a instância é o handle: ask/stream/approve/reject), AdkModule com discovery fail-fast, prompts (string, AdkPrompt builder ou promptFile), modelos como classes (Gemini/OpenAiLike/ModelRouter com failover), structured output validado, Continuity (offload automático, compaction nativa, HITL approve/reject), embeddings (Embedder + Similarity), logs por nível com tokens I/O/C, MCP client e pacote de testing (TestAgent, ScriptedEngine/ScriptedModel, matchers, judge).
