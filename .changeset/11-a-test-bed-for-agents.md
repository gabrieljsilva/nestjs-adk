---
"@nestjs-adk/testing": major
"@nestjs-adk/core": major
---

A test bed that boots the application and lets a test decide what each agent answers on.

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

`withModelFor` decides the model agent by agent through the runtime's own `ModelResolver`, which every entrypoint consults. A real provider can decide while scripts answer, transfers and delegations included, so a paid suite pays for the decision and nothing else. A bed whose agents do not all run on a model the test chose refuses to boot, naming them, which is what keeps a suite meant to be free from reaching a provider by accident; a suite that means it says `allowingUnscriptedModels()`.

## The run is the evidence

`ask` answers a `RecordedRun`: the same `AgentResult` production returns, carrying the events of that run. Matchers read those events, so the same assertion holds for a script and for a provider: `toHaveRunTool`, `toHaveRequestedTool`, `toAwaitApproval`, `toHaveDeniedTool`, `toHaveTransferredTo`, `toHaveDelegatedTo`, `toHaveStatus`, `toBeFullyPlayed`.

`toCallTool` is gone. It read the scripted model's own requests, so it never worked against a real provider, and it could not tell a tool that ran from one that stopped in front of a human.

Two matchers answer questions a fake cannot. `toHaveStablePrefix(threshold)` compares the exact contexts assembled across runs, measures how much of the prefix held still and, on failure, points at the segment and the text where they parted ways, which is what finds the timestamp quietly killing a provider's prompt cache. `toBeSimilarTo` compares meaning through an embedder, for an answer whose wording moves every run.

## A turn that arrives in pieces

`stream` is public API and nothing outside the core exercised it: the scripted model sent every answer as a single chunk and the test agent had no way to consume a generator, so a caller that consumed `stream` had no offline level to be tested at.

```ts
script.mockStream(["A garantia ", "é de 90 ", "dias."]);

const run = await bed.agent(WarrantyAgent).stream("qual a garantia?");
run.textDeltas;    // ["A garantia ", "é de 90 ", "dias."]
run.wasStreamed;   // true
run.text;          // "A garantia é de 90 dias."
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
