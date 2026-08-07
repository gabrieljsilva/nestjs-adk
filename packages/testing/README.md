# @nestjs-adk/testing

Testing utilities for [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core) agents.

Testing an agent is hard because the model is not deterministic. This package answers that by letting a test decide what each agent answers on, and by leaving everything else alone: the container, your decorators, your tools, your approval policy and your database are the ones production uses. Your setup stays plain `@nestjs/testing`, and what this adds is only what agents needed.

```bash
npm i -D @nestjs-adk/testing
```

## Booting the application

`AdkTestBedBuilder` wraps `Test.createTestingModule` rather than hiding it. Give each agent a script, and boot:

```ts
import { AdkTestBedBuilder } from "@nestjs-adk/testing";
import "@nestjs-adk/testing/matchers";

await using bed = await AdkTestBedBuilder.for({ imports: [AppModule] })
	.withScript(BillingAgent, (script) =>
		script.mockToolCall("find_order", { orderId: "A-1042" }).mockText("That order cost 349 reais."),
	)
	.overriding(PaymentGateway, fakeGateway) // any token, straight through to NestJS
	.boot();

const run = await bed.agent(BillingAgent).ask("How much did order A-1042 cost?");

expect(run).toHaveRunTool("find_order", { orderId: "A-1042" });
expect(run.text).toContain("349");

```

The tool really runs, through real dependency injection, which is what proves your wiring. `boot()` compiles and initializes, because the runtime is composed in `onModuleInit`.

### Testing the caller instead of the agent

A run started by your own service is recorded just as fully as one the test asked for:

```ts
const reply = await bed.get(SendMessageUseCase).execute("How much did order A-1042 cost?");

expect(bed.events).toHaveRunTool("find_order");
```

## One script per agent

Each agent gets its own script, so a transfer or a delegation can never consume turns queued for somebody else:

```ts
await AdkTestBedBuilder.for({ imports: [AppModule] })
	.withScript(ConciergeAgent, (s) => s.mockToolCall("transfer_to_agent", { agentName: "warranty" }).mockText("Handing you to warranty."))
	.withScript(WarrantyAgent, (s) => s.mockText("We will replace your controller."))
	.boot();
```

Scripts are strict. A run that asks for a turn nobody queued fails naming the agent, and `bed.verify()` fails when the test described a conversation the run never had. A turn can also guard the request that plays it:

```ts
script.mockText("Sure!").expecting(/order A-1042/);
```

There is also `mockToolCalls([...])` for the parallel case, `mockFailure(new RateLimitedFailure("429"))` for testing failover, and `mockStream([...])` for an answer that arrives in pieces:

```ts
script.mockStream(["A garantia ", "é de 90 ", "dias."]);
```

`mockText` sends the whole answer in one chunk, which is what a provider sends with streaming off. Use `mockStream` when the caller under test consumes `stream`: against a single chunk, a caller that collects everything and paints it once at the end passes just as well as one that paints as it goes.

## Real models, or a mix of both

`withModelFor` decides the model agent by agent, through the same resolver production uses. A transfer, a delegation and a resumed approval each resolve again, so a real model can decide while scripts answer:

```ts
await AdkTestBedBuilder.for({ imports: [AppModule] })
	.withModelFor(ConciergeAgent, new OpenAiModel("gpt-5.6-luna", { apiKey })) // pay for the decision
	.withScript(WarrantyAgent, (s) => s.mockText("We will replace your controller.")) // not for the answer
	.withScript(SalesAgent, (s) => s.mockText("nothing to sell right now"))
	.boot();
```

A bed whose agents do not all run on a model the test chose refuses to boot, naming them. That is what keeps a suite meant to be free from reaching a provider by accident. A suite that means it says so:

```ts
.allowingUnscriptedModels()
```

## What a run answers

`ask` returns a `RecordedRun`: the same `AgentResult` your application receives, carrying the events of that run.

```ts
run.text;                          // what the agent answered
run.status;                        // completed, suspended, failed
run.toolCalls;                     // every call, with args, output and outcome
run.callsTo("issue_refund");       // just this tool
run.pendingCall("issue_refund");   // the call a human has to answer about
run.transfers, run.delegations;
run.events;                        // the raw events, for a question the rest does not cover
```

Because assertions read events and not the double, the same test body works against a script and against a provider.

`stream` answers a `StreamedRun`, which is that same run plus the pieces the answer arrived in:

```ts
const run = await bed.agent(SalesAgent).stream("qual a garantia?");

run.textDeltas;    // ["A garantia ", "é de 90 ", "dias."]
run.wasStreamed;   // false when the whole answer came in one chunk
run.text;          // the pieces joined, same as ask would have answered
```

The bed drains the generator for you. `AgentHandle.stream` returns the result as the generator's return value, and a `for await` discards it, so a test that iterated by hand would be left asserting on nothing.

## Matchers

```ts
import "@nestjs-adk/testing/matchers";
```

| Matcher | Asserts |
| --- | --- |
| `toHaveRunTool(name, args?)` | the tool answered, optionally with these arguments |
| `toHaveRequestedTool(name)` | the model asked for it, run or not |
| `toAwaitApproval(tool?)` | the run stopped in front of a human |
| `toHaveDeniedTool(name)` | a human refused it and the conversation carried on |
| `toHaveTransferredTo(agent)` | the session changed hands |
| `toHaveDelegatedTo(agent)` | one task went to a specialist |
| `toHaveStatus(status)` | the run ended in this state |
| `toHaveBeenCalledWithArgs(args)` | a `ToolFake` was called with these |
| `toBeFullyPlayed()` | every queued turn was played |
| `toBeSemanticallyCloseTo(text, min?)` | close enough in meaning, with no provider call |
| `toHaveStablePrefix(threshold)` | two or more context snapshots share this exact opening ratio |
| `toSatisfyRubric(judge, criteria)` | a model graded the answer |

The stable-prefix matcher measures the text assembled by the runtime, independently of the
provider cache accounting. Explain two fresh runs, then compare one model call from each:

```ts
const agent = bed.get(SalesAgent);
const first = await agent.explain("price order A-1042");
const second = await agent.explain("price order A-77");

expect([first[0], second[0]]).toHaveStablePrefix(0.9);
```

The ratio uses the largest context as its denominator. On failure, the assertion names the
segment, character offset and excerpts where the prompts stopped matching.

## Approvals

A run that stopped in front of a human is resumed by naming the tool, so no test has to fish for a call id:

```ts
const run = await bed.agent(BillingAgent).ask("Refund the 349 reais from order A-1042.");
expect(run).toAwaitApproval("issue_refund");

const resumed = await bed.agent(BillingAgent).approve("issue_refund", "manager@example.com");
expect(resumed).toHaveRunTool("issue_refund");
```

`reject(reason, tool?)` is the other half.

## Replacing what a tool does

```ts
const refund = ToolFake.replacing(IssueRefundTool).succeedsWith({ refunded: true });

await using bed = await AdkTestBedBuilder.for({ imports: [AppModule] })
	.withScript(BillingAgent, (s) => s.mockToolCall("issue_refund", { orderId: "A-1042" }).mockText("Refund issued."))
	.replaceTool(IssueRefundTool, refund)
	.boot();

expect(refund.lastArgs()).toEqual({ orderId: "A-1042" });
```

`failsWith(error)` and `executes(fn)` are the other two forms.

`overrideProvider(IssueRefundTool)` also works, in all three forms, and the tool keeps the declaration the agent listed. `replaceTool` is the shorter way to say it and records the arguments for you.

To assert only what the **real** tool received, no double is needed. That is already in the run:

```ts
expect(run.callsTo("issue_refund").at(0)?.args).toEqual({ orderId: "A-1042" });
```

## Testing a use case, without a runtime

A service whose only job is handing a request to an agent does not need one:

```ts
const stub = new AgentStub().answersWith("answered");
const module = await Test.createTestingModule({ providers: [SendMessageUseCase] })
	.overrideProvider(ConciergeAgent).useValue(stub)
	.compile();

await module.get(SendMessageUseCase).execute("hello");

expect(stub.asks.map((ask) => ask.message)).toEqual(["hello"]);
expect(stub.lastOptions.sessionId).toBeUndefined();
```

`AgentStub.awaiting("issue_refund")` answers a suspended run, for the caller that has to handle one, and `thenAnswers(...)` queues one answer at a time.

The stub answers `ask`, `approve` and `reject`, and refuses `inspect` on purpose: reading where a session stands means there is a runtime, and that is what the bed is for. If your test constructs the service directly instead of resolving it, extend your own agent class so the type still matches.

## Suites that spend money

Load the repository `.env` in Vitest configuration and read required keys directly from `process.env`:

```ts
// vitest.config.ts
process.loadEnvFile(resolve(__dirname, ".env"));

const openAILuna = new OpenAiModel("gpt-5.6-luna", { apiKey: process.env.OPEN_AI_API_KEY! });

describe("AI: billing", () => {
	it("...", async () => {
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.withModel(openAILuna)
			.allowingUnscriptedModels()
			.withConsumers(new RunTranscript()) // prints the conversation, which is how a paid suite is read
			.boot();
	});
});
```

The transcript keeps the paid run readable and distinguishes ownership from a temporary delegation:

```text
› I want to check my order.
→ warranty → billing
⚙ billing: find_order({"orderId":"A-1042"})
↩ billing: find_order {"totalBrl":349}
✓ issue_refund by manager
× issue_refund by manager: outside the window
‹ billing: The order cost R$ 349.00.
```

When Vitest is the runner, set `disableConsoleIntercept: true` on the paid-test project so it does not wrap every transcript line in a repeated `stdout | file > test` block.

`RecordingModel` wraps any model and keeps every request and every chunk, for inspecting what a provider was actually sent:

```ts
const recording = new RecordingModel(realModel);
// ... after the run
expect(recording.calls.at(0)?.request.instructions?.text).toContain("Answer in a friendly tone.");
```

Compare provider embeddings without repeating cosine calculations in the suite:

```ts
expect(await embedder.embed(firstAnswer)).toBeSimilarTo(await embedder.embed(secondAnswer), 0.6);
```

## Measuring a storage you wrote

`SessionStorage` is a port an application implements when SQLite is not where its sessions belong. `SessionStorageContractSuite` is every promise that port makes, as cases:

```ts
import { SessionStorageContractSuite } from "@nestjs-adk/testing";

const suite = new SessionStorageContractSuite();

for (const contract of suite.cases(() => new PrismaSessionStorage(prisma))) {
	it(contract.name, () => contract.run());
}
```

The suite is data, not a test file: it yields `ContractCase` objects and asserts with `node:assert`, so vitest, jest and `node:test` all drive it. It reads your `capabilities()` and only demands what you claimed, so a storage honest about being ephemeral is not held to optimistic concurrency, while one claiming durable sessions answers for all four guarantees: a batch written whole or not at all, `expectedRevision` deciding who wins a race, contiguous revisions, and the same event id written twice written once.

It is the same suite that measures `InMemorySessionStorage` and `SqliteSessionStorage`, which is the point. An adapter checked by tests written alongside it drifts from the contract as the contract grows, and the drift stays invisible until a session breaks in production.

Everything it needs from `@nestjs-adk/core` is published there: the codecs, the records and the four errors the port has to throw. See the storage section of the core README.

## API reference

Everything the package exports. A name that is not here is not part of the public surface.

### Booting and reaching a run

| Symbol | What it is for |
| --- | --- |
| `AdkTestBedBuilder` | Builds the bed: `for(metadata)` or `from(builder)`, then `withScript`, `withModel`, `withModelFor`, `replaceTool`, `withRuntime`, `withConsumers`, `overriding`, `allowingUnscriptedModels`, `boot` |
| `AdkTestBed` | What `boot` answers: `get`, `agent`, `script`, `tool`, `events`, `verify`, `close`. Disposable with `await using` |
| `TestAgent` | One agent as a test drives it: `ask`, `stream`, `approve`, `reject`, `inspect`, `newSession`, `lastInstruction` |
| `RecordedRun` | An `AgentResult` with the evidence attached: `toolCalls`, `toolsRun`, `toolsRequested`, `transfers`, `delegations`, `callsTo`, `pendingCall` |
| `StreamedRun` | The same, plus the pieces the answer arrived in |
| `RunEvents`, `RunRecorder` | This run's events alone, and the consumer that collects them |
| `RecordedToolCall`, `ToolCallOutcome` | One tool call as it happened, and how it ended |
| `RunTranscript` | The conversation printed as it happens |

### Standing in for a model

| Symbol | What it is for |
| --- | --- |
| `ScriptedModel` | Answers a queue instead of thinking. `mockText`, `mockDeltas`, `mockToolCall`, `mockFailure`, `strict`, and every `request` it was given |
| `ScriptedTurn`, `ScriptedCall`, `TurnExpectation` | One queued turn, the call inside it, and the guard that refuses a request which drifted |
| `RecordingModel`, `RecordedModelCall` | Wraps a real model and keeps the traffic, which is what makes a paid run readable afterwards |
| `RoutingModelResolver` | Routes one agent to one model, so a mixed run is possible: a real provider deciding, scripts answering |
| `TestingEmbedder` | Deterministic vectors, so a similarity assertion costs nothing |
| `TestImage` | The smallest image with an unambiguous answer, for multimodal tests |

### Standing in for the application's own pieces

| Symbol | What it is for |
| --- | --- |
| `ToolFake`, `FakeToolCall` | Replaces what a tool does while keeping its name, schema, effect and identity, and records the calls |
| `AgentStub`, `StubbedAsk`, `StubbedDecision` | Replaces a whole agent, for testing the caller rather than the agent |
| `LlmJudge`, `JudgeRubric`, `JudgeVerdict` | Grading prose a string match cannot assert |
| `SessionStorageContractSuite` | Every promise the `SessionStorage` port makes, as cases any runner drives |

### Errors

Every one extends `AdkError` and carries a stable `code`; each documents itself in its own JSDoc. `ScriptDeviationError`, `ScriptExhaustedError`, `ScriptMisuseError` and `ScriptNotConsumedError` are the four ways a script and a run disagree. `UnknownTestAgentError` and `UnscriptedAgentError` are refused boots: a name nobody declared, and an agent whose model the test did not choose. `NothingAwaitingError` is asking for a pending call when nothing is pending.

Matchers live at `@nestjs-adk/testing/matchers` and are listed above.
