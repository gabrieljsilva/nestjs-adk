# @nestjs-adk/openai

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

- f9bd943: A thinking model's reasoning comes back with the call it led to.

  DeepSeek streams `reasoning_content` ahead of a tool call and refuses the next request of the same turn unless the assistant message replaying the call brings it back. The refusal is a 400 the failover policy correctly stops on, so an approved call resumed a turn later died as `ModelsExhaustedError` naming a malformed request.

  The OpenAI adapter now gathers the reasoning of one stream in an `OpenAiReasoningTrace` and hands it to the first tool call that opens, as that call's signature: the opaque slot a provider's own bookkeeping already had. It never reaches the answer's text. On the way back, `OpenAiRequestMapper` folds calls the model made in one breath into one assistant turn with several `tool_calls`, which is the shape it produced them in, and sets `reasoning_content` on that turn when a call carries a signature. The turn also carries `content: ""`, which DeepSeek's validation expects on the message it returned; the field missing was refused with the same error as the reasoning missing.

  ## Calls made in one breath stay together

  `ContextProjector` used to give every call its own block, the result folded in behind it, so three calls the model made at once were read back as three assistant turns, each answered before the next was asked. Every provider produced them as one turn with three calls, and a thinking model attaches its reasoning to that one turn: split, two thirds of them were turns it never reasoned about, and DeepSeek refused the request. Calls requested back to back with nothing conversational between them now share one `ContextBlock`, calls first and results after all of them, closed when the last is answered; `ContextBlock.alsoCalling` is how the block grows. Compaction's unit is unchanged: the breath is still the smallest thing that may be dropped or kept.

  `OpenAiOptions.replaysReasoning` decides whether it is sent. Unset, it follows `baseURL`: a compatible endpoint gets it and the official API, which refuses a message field it does not know, does not.

- ae5b34e: A compatible endpoint says what it can see, and two contract suites can share one database.

  `OpenAiOptions.capabilities` takes `{ mediaInput?, mediaUrl? }`. Left out, the adapter keeps assuming the official API, which reads images and fetches them by URL. `OpenAiModel` is also the door to Groq, Together, OpenRouter, DeepSeek and Ollama, and "compatible with OpenAI" covers an endpoint with no vision at all; there the guard passed and the refusal came from the provider, already paid. `{ mediaInput: false }` makes `ModelService` refuse the image before the session is opened, the same way it does for a model that never declared the capability.

  `SessionStorageContractSuite` and `ArtifactStorageContractSuite` prefix every session id with a token picked per suite instance. Both used `s-1` and `s-2`, so two files measuring two stores against one database in parallel truncated each other's rows, and the failure landed on whichever lost the race. The `types` of the `@nestjs-adk/testing/matchers` subpath points at the file the build emits, `matchers.support.d.ts`, so the matcher augmentation types again.

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
