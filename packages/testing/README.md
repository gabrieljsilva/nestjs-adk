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

const bed = await AdkTestBedBuilder.for({ imports: [AppModule] })
	.withScript(BillingAgent, (script) =>
		script.mockToolCall("find_order", { orderId: "A-1042" }).mockText("Custou 349 reais."),
	)
	.overriding(PaymentGateway, fakeGateway) // any token, straight through to NestJS
	.boot();

const run = await bed.agent(BillingAgent).ask("Quanto custou o pedido A-1042?");

expect(run).toHaveRunTool("find_order", { orderId: "A-1042" });
expect(run.text).toContain("349");

await bed.close();
```

The tool really runs, through real dependency injection, which is what proves your wiring. `boot()` compiles and initializes, because the runtime is composed in `onModuleInit`.

### Testing the caller instead of the agent

A run started by your own service is recorded just as fully as one the test asked for:

```ts
const reply = await bed.get(SendMessageUseCase).execute("Quanto custou o pedido A-1042?");

expect(bed.events).toHaveRunTool("find_order");
```

## One script per agent

Each agent gets its own script, so a transfer or a delegation can never consume turns queued for somebody else:

```ts
await AdkTestBedBuilder.for({ imports: [AppModule] })
	.withScript(ConciergeAgent, (s) => s.mockToolCall("transfer_to_agent", { agentName: "warranty" }).mockText("Passei."))
	.withScript(WarrantyAgent, (s) => s.mockText("Vamos trocar o seu controle."))
	.boot();
```

Scripts are strict. A run that asks for a turn nobody queued fails naming the agent, and `bed.verify()` fails when the test described a conversation the run never had. A turn can also guard the request that plays it:

```ts
script.mockText("Claro!").expecting(/pedido A-1042/);
```

There is also `mockToolCalls([...])` for the parallel case and `mockFailure(new RateLimitedFailure("429"))` for testing failover.

## Real models, or a mix of both

`withModelFor` decides the model agent by agent, through the same resolver production uses. A transfer, a delegation and a resumed approval each resolve again, so a real model can decide while scripts answer:

```ts
await AdkTestBedBuilder.for({ imports: [AppModule] })
	.withModelFor(ConciergeAgent, new OpenAiModel("gpt-5.6-luna", { apiKey })) // pay for the decision
	.withScript(WarrantyAgent, (s) => s.mockText("Vamos trocar o seu controle.")) // not for the answer
	.withScript(SalesAgent, (s) => s.mockText("nada a vender agora"))
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
| `toSatisfyRubric(judge, criteria)` | a model graded the answer |

## Approvals

A run that stopped in front of a human is resumed by naming the tool, so no test has to fish for a call id:

```ts
const run = await bed.agent(BillingAgent).ask("Devolve os 349 reais do pedido A-1042.");
expect(run).toAwaitApproval("issue_refund");

const resumed = await bed.agent(BillingAgent).approve("issue_refund", "manager@example.com");
expect(resumed).toHaveRunTool("issue_refund");
```

`reject(reason, tool?)` is the other half.

## Replacing what a tool does

```ts
const refund = ToolFake.replacing(IssueRefundTool).succeedsWith({ refunded: true });

const bed = await AdkTestBedBuilder.for({ imports: [AppModule] })
	.withScript(BillingAgent, (s) => s.mockToolCall("issue_refund", { orderId: "A-1042" }).mockText("Feito."))
	.replaceTool(IssueRefundTool, refund)
	.boot();

expect(refund.lastArgs()).toEqual({ orderId: "A-1042" });
```

`failsWith(error)` and `executes(fn)` are the other two forms. Do not reach for `overrideProvider` here: a tool registered as a value or as another class silently leaves the catalog.

To assert only what the **real** tool received, no double is needed. That is already in the run:

```ts
expect(run.callsTo("issue_refund").at(0)?.args).toEqual({ orderId: "A-1042" });
```

## Testing a use case, without a runtime

A service whose only job is handing a request to an agent does not need one:

```ts
const stub = new AgentStub().answersWith("respondido");
const module = await Test.createTestingModule({ providers: [SendMessageUseCase] })
	.overrideProvider(ConciergeAgent).useValue(stub)
	.compile();

await module.get(SendMessageUseCase).execute("oi");

expect(stub.asks.map((ask) => ask.message)).toEqual(["oi"]);
expect(stub.lastOptions.sessionId).toBeUndefined();
```

`AgentStub.awaiting("issue_refund")` answers a suspended run, for the caller that has to handle one, and `thenAnswers(...)` queues one answer at a time.

The stub answers `ask`, `approve` and `reject`, and refuses `inspect` on purpose: reading where a session stands means there is a runtime, and that is what the bed is for. If your test constructs the service directly instead of resolving it, extend your own agent class so the type still matches.

## Suites that spend money

`ApiKeyGate` skips a paid suite without a key, and fails with the variables it looked for when one is needed:

```ts
const gate = ApiKeyGate.fromEnv(["OPENAI_API_KEY"]);

describe.runIf(gate.present)("AI: billing", () => {
	it("...", async () => {
		const bed = await AdkTestBedBuilder.for({ imports: [AppModule] })
			.withModel(new OpenAiModel("gpt-5.6-luna", { apiKey: gate.keyOrFail() }))
			.allowingUnscriptedModels()
			.withConsumers(new RunTranscript()) // prints the conversation, which is how a paid suite is read
			.boot();
	});
});
```

`RecordingModel` wraps any model and keeps every request and every chunk, for inspecting what a provider was actually sent:

```ts
const recording = new RecordingModel(realModel);
// ... after the run
expect(recording.calls.at(0)?.request.instructions?.text).toContain("Answer in a friendly tone.");
```

## Also in the box

- `LlmJudge` and `JudgeRubric`, for grading prose that a string match cannot assert.
- `TestingEmbedder`, deterministic vectors, so `toBeSemanticallyCloseTo` costs nothing.
- `TestImage`, the smallest image with an unambiguous answer, for multimodal tests.
- `RunTranscript`, the conversation printed as it happens.
