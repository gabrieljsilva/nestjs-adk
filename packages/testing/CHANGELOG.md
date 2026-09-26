# @nestjs-adk/testing

## 2.0.1

### Patch Changes

- 32de979: O Node mínimo passa a ser 22.5.0, que é a versão real exigida

  `node:sqlite` entrou no Node em 22.5.0. O core importa esse módulo no
  adapter de SQLite e o exporta no barrel, então `import` de
  `@nestjs-adk/core` em Node 20 estoura com `No such built-in module:
node:sqlite`. Os manifestos declaravam `>=20`, ou seja, o npm aprovava a
  instalação e a quebra aparecia depois, no primeiro import, longe da causa.

  Os cinco pacotes passam a declarar `>=22.5.0`, e o `.nvmrc` acompanha com
  `22`. O CI lia o `.nvmrc` pelo `setup-node` e rodava em Node 20: 64 dos
  430 arquivos de teste falhavam por isso, todos os que alcançam o adapter.

- Updated dependencies [32de979]
  - @nestjs-adk/core@2.0.1

## 2.0.0

### Major Changes

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

- ae5b34e: An artifact changes in place, and the reference you read is the lock on it.

  `ArtifactStorage` gains `update(context, reference, content): Promise<ArtifactReference>`. It replaces what one artifact holds while keeping its id and its position in the session's list, and both halves of that matter. The id is already written into placeholders the conversation cannot take back, and re-listing an edited file first would reorder what `list_artifacts` shows every time a model fixes a typo.

  The `reference` you pass is the one you read, and its digest is optimistic concurrency. The store compares it with what it holds now and throws `TamperedArtifactReferenceError` when the two disagree, so a writer working from a version somebody else has since replaced is refused instead of overwriting them. Writing is scoped like reading: a reference from another conversation answers `ArtifactNotFoundError`, and nothing is written.

  Mutating content that a durable journal points at sounds unsafe, and it is not, because the journal never persists a digest. `AttachmentReferenceCodec` writes the artifact id and at most the media type, and every read path re-finds the reference through `ArtifactStorage.find` before reading it. So there is no stored digest anywhere that an edit could invalidate, and the digest check only ever compares a reference read in the same turn.

  The cost is a sentence rather than a corruption, and it is worth knowing: a placeholder already written into `ToolResultProduced` still quotes the character count the artifact had then, and nothing rewrites a past event. That is why `edit_artifact` answers with the new size, so the turn that changed the file also states the number that is now true.

  **Breaking:** `update` is abstract. An `ArtifactStorage` written outside this package does not compile until it implements it. That is deliberate rather than a default that throws: a default would split stores into ones that can be edited and ones that cannot, with nothing in the types saying which you have, and the application would find out when a model called `edit_artifact` in production.

  `ArtifactStorageContractSuite` gains three cases for it. An update keeps the id and the place in the list; a stale reference is refused and leaves the content the accepted write put there; and one session cannot update another's even holding the right reference. `InMemoryArtifactStorage` and `SqliteArtifactStorage` answer all three in the same loop as the rest.

### Minor Changes

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

- ae5b34e: A model can ask what files it has.

  `list_artifacts` joins the artifact tools. It takes nothing and answers the session's artifacts, newest first: id, name, type, size, and which tools read each one under the offload policy. It exists because the only ids a model knew were the ones it had seen in a placeholder, and a file attached before the conversation was compacted, or attached outside a question, had no line left to be seen in. Like the others it is `internal`, resolves inside the session that asked, and fits its answer to the offload budget. It stops at a hundred entries and says `truncated`.

  **Breaking:** `ArtifactStorage` gains `list(context, limit)`, abstract. It answers the session's references, newest first, never more than `limit`, and an empty list for a session that owns nothing. `ArtifactStorageContractSuite` gains "lists only what the session owns, newest first, up to the bound". The two shipped stores implement it; an adapter written outside this package has to.

- ae5b34e: An artifact larger than the tools will load, and a page that never loads the whole thing.

  `search_artifact` runs `matchAll` over the whole text, and `outline_artifact`, `query_artifact` and `slice_artifact` parse all of it. That is fine for what a conversation produces and wrong past a few tens of megabytes. `RuntimeOptions.context.maxExplorableCharacters` (twenty million by default) is the largest artifact those tools load whole; above it they answer `{ refused: true, reason }` naming the ceiling and the way out, before reading a byte.

  The way out is `read_artifact` by character range, which no longer loads the artifact at all. `ArtifactStorage.readRange(context, reference, offset, length)` is a new method with a default implementation that reads and slices, so every adapter has it; `SqliteArtifactStorage` overrides it with `substr` inside the database. `ArtifactStorageContractSuite` gains "reads a range of what it holds", which holds an override to the same characters a full read gives. Reading by line still loads the whole text, because line starts are not known without it, and is under the ceiling.

### Patch Changes

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

- f9bd943: The matchers type-check on vitest 4.

  The augmentation in `@nestjs-adk/testing/matchers` was aimed at `Assertion` on the `vitest` module. Since vitest 4 that name is only re-exported from `@vitest/expect`, and an augmentation aimed at a re-export merges into nothing: every `expect(x).toHaveRunTool(...)` ran and passed while `tsc` reported that the property did not exist. The block now extends `Matchers<T>`, which vitest folds into both `Assertion` and `AsymmetricMatchersContaining`, so the separate asymmetric block is gone with it. Nothing changes at runtime.

- ae5b34e: A compatible endpoint says what it can see, and two contract suites can share one database.

  `OpenAiOptions.capabilities` takes `{ mediaInput?, mediaUrl? }`. Left out, the adapter keeps assuming the official API, which reads images and fetches them by URL. `OpenAiModel` is also the door to Groq, Together, OpenRouter, DeepSeek and Ollama, and "compatible with OpenAI" covers an endpoint with no vision at all; there the guard passed and the refusal came from the provider, already paid. `{ mediaInput: false }` makes `ModelService` refuse the image before the session is opened, the same way it does for a model that never declared the capability.

  `SessionStorageContractSuite` and `ArtifactStorageContractSuite` prefix every session id with a token picked per suite instance. Both used `s-1` and `s-2`, so two files measuring two stores against one database in parallel truncated each other's rows, and the failure landed on whichever lost the race. The `types` of the `@nestjs-adk/testing/matchers` subpath points at the file the build emits, `matchers.support.d.ts`, so the matcher augmentation types again.

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
