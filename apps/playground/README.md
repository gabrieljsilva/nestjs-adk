# Playground: the Nébula Games store

A NestJS application that uses `nestjs-adk` the way an application would, so the library has somewhere to be wrong.

The provider suites in `packages/google` and `packages/openai` compose the runtime by hand, with `AdkRuntimeHost` and `AgentRunCommand`. None of them passes through a decorator, the Nest container or an injected agent, which is exactly the path you write. This app is that path: a wiring mistake between a decorator and the catalog fails here and nowhere else.

## What the store is

Nébula Games sells console titles and accessories. Catalog and orders live in SQLite, written by a fixed seed, so nothing reaches the network below the paid level. Prices are deliberately not round: a total only the catalog knows is what separates an answer that used a tool from an answer the model made up.

Customer support has four sectors, which is what makes transfer and delegation a need of the business rather than a demonstration.

| Sector | Agent | Tools |
| --- | --- | --- |
| Front desk | `concierge` | none, it only decides which sector owns the question |
| Sales | `sales` | `search_games`, `quote_game` |
| Warranty | `warranty` | `open_ticket`, and delegates the refund ceiling to billing |
| Billing | `billing` | `find_order`, `refund_limit`, `issue_refund` |

`issue_refund` is declared `destructive`, and the application turns that into a human approval with `EffectApprovalPolicy.from(ToolEffect.DESTRUCTIVE)`. Order `A-1042` was delivered two days ago and is inside the refund window; `B-2071` is forty days out and is not.

Layers run one way: `controller` calls `use-case`, which calls `service`, which calls `repository`, which talks to SQLite. The agents' tools are providers that call use cases, so no business rule lives inside a tool.

### The Nébula Club, which boots on its own

`src/loyalty/` is a second application in the same repository, and it is separate on purpose. The four sectors declare their prompts in `@Agent({ prompt })` and are the comparison, so the club is where the other way is exercised: three desks whose prompt is built once per run by an overridden `prompt()`.

| Desk | Agent | Where its prompt comes from |
| --- | --- | --- |
| Concierge | `club` | `club-concierge.md`, with the member's name, tier and points interpolated |
| Rules | `club-rules` | `club-rules.md`, with no variables at all |
| Guest | `club-guest` | a string the agent already holds, rendered with the session id |

`clubOptions` points `prompts.dir` at `src/loyalty/prompts` through `import.meta.url`, which is the pattern to copy: a relative path would resolve against wherever the process was started. `club.e2e.spec.ts` covers all three, the failures each one can reach, and asserts with `toHaveStablePrefix` that a prompt varying only by a member's name still leaves a cacheable prefix.

## Three levels, and what each one answers

Every level is driven from the repository root.

### Unit and integration, free and offline

```bash
npm run test:playground
```

54 files, 228 cases, no key and no network. Each layer is tested alone: repository against an in memory database, service and use case against fakes, controller against a fake use case.

`store-chat.e2e.spec.ts` is the one that boots the whole application with `Test.createTestingModule` and answers a conversation with `ScriptedModel` in place of a provider. It is where the paths that would be expensive to prove with a real model live: an approval refused, a tool that fails, an iteration limit, and compaction replacing turns with a summary.

### Real models, paid

```bash
npm run test:playground:agents
```

42 cases in 5 files, one file per sector plus one for the testing API itself. Only what a fake cannot answer: whether a real model picks the right sector, calls the tool with the arguments the catalog expects, stops in front of a human before money leaves, and looks at a photo.

Requires both keys in a `.env` at the repository root:

```
OPEN_AI_API_KEY=...
GEMINI_API_KEY=...
```

`vitest.config.ts` loads that file, and the suite fails naming the missing key rather than running half of itself.

## What the paid suite costs

Three models, and no others: `gpt-5.6-luna` runs the store, `gemini-3.5-flash-lite` is the second provider, and `gemini-embedding-2` backs the similarity case. Every scenario is the smallest question with a right answer, `temperature: 0` where the provider accepts it, and a 256 token output ceiling.

Measured over the full run: 42 cases in 5 files, all green, 96 seconds of wall clock. The files run one at a time, because four suites against one key spend the per minute quota on rate limit errors instead of on answers. Prompts are a few thousand characters, so the run sits in the cents.

The agreed ceiling for the whole suite is two dollars. What the run cost in money is not reported here, and that is a gap rather than an omission: token usage is journalled per assistant message along with the model that served it, but turning tokens into currency is native pricing, which is not in this release. Until it is, read the figure off the provider's own dashboard.

## Reading a paid run

`RunTranscript` is a `SessionEventConsumer` that costs nothing and prints the conversation as it happens, naming the agent on every line:

```
  › Refund the 349 reais from order A-1042.
  ⚙ billing: find_order({"orderId":"A-1042"})
  ↩ billing: find_order {"totalBrl":349,"plan":"gold","daysSinceDelivery":2}
  ⚙ billing: issue_refund({"amountBrl":349,"orderId":"A-1042"})
  ⏸ issue_refund
```

Without it a paid suite is a green tick that says nothing about what the model actually did.

## A different database

The store and the session journal share one SQLite connection, so a conversation and the orders it talks about are in the same file. In a test each boot gets its own connection, overridden on the bed:

```ts
const connection = new SqliteConnection();
await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
	.overriding(StoreDatabase, new StoreDatabase(connection))
	.overriding(SessionStorage, new SqliteSessionStorage(connection))
	.boot();
```

Passing a path instead of nothing puts it on disk, which is how the suite proves a second application continues a conversation the first one started.
