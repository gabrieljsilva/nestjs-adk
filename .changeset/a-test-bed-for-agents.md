---
"@nestjs-adk/testing": major
"@nestjs-adk/core": major
---

A test bed that boots the application and lets a test decide what each agent answers on.

## `AdkTestBed`

Testing an agent used to mean rebuilding the module options by position to swap one model, sharing a single script across every agent, and asserting on the double for a fake run and on a hand written consumer for a real one. The bed replaces all three.

```ts
const bed = await AdkTestBedBuilder.for({ imports: [AppModule] })
  .withScript(BillingAgent, (script) => script.mockToolCall("find_order", { orderId: "A-1042" }).mockText("349 reais"))
  .boot();

const run = await bed.agent(BillingAgent).ask("Quanto custou o pedido A-1042?");

expect(run).toHaveRunTool("find_order", { orderId: "A-1042" });
```

It wraps `Test.createTestingModule` rather than hiding it: `overriding` passes any token straight through, so a database is replaced the way it always was.

## One script per agent, and one model per agent

`withScript` binds a script to one agent, so a transfer or a delegation can no longer consume turns queued for somebody else. Scripts are strict: a run that asks for a turn nobody queued fails naming the agent, and `bed.verify()` fails when the test described a conversation the run never had.

`withModelFor` decides the model agent by agent through the runtime's own `ModelResolver`, which every entrypoint consults. A real provider can decide while scripts answer, transfers and delegations included, so a paid suite pays for the decision and nothing else.

A bed whose agents do not all run on a model the test chose refuses to boot, naming them. That is what keeps a suite meant to be free from reaching a provider by accident; a suite that means it says `allowingUnscriptedModels()`.

## The run is the evidence

`ask` answers a `RecordedRun`: the same `AgentResult` production returns, carrying the events of that run. Matchers read those events, so the same assertion holds for a script and for a provider: `toHaveRunTool`, `toHaveRequestedTool`, `toAwaitApproval`, `toHaveDeniedTool`, `toHaveTransferredTo`, `toHaveDelegatedTo`, `toHaveStatus`, `toBeFullyPlayed`.

`toCallTool` is gone. It read the scripted model's own requests, so it never worked against a real provider, and it could not tell a tool that ran from one that stopped in front of a human.

## Also new

`ToolFake` replaces what a tool does while keeping the tool the application declared. `AgentStub` answers for an agent with no runtime under it, for the use case that only hands a request over. `RecordingModel` wraps any model and keeps the traffic. `ApiKeyGate` skips a paid suite without a key and fails with the variables it looked for. `RunEvents`, `RunRecorder` and `RunTranscript` moved into the package from the example application.

## Core

`RuntimeOptions` and `AdkModuleOptions` gain `from` and `with`, so three fields change without restating twelve. `ModelResolver` is a provider of the module, which is what its documentation already promised. `ADK_DEFAULT_MODEL`, `ADK_EVENT_CONSUMERS` and `ADK_RUNTIME_PATCH` replace the fallback model, append consumers and patch runtime fields by name. `@Agent` reads `failover`, so a declared list of models becomes a `SequentialFailoverPolicy`. `AgentMetadata` and `ToolMetadata` read back what the decorators wrote.

`ToolApprovalDenied` now names the tool that was refused, at schema version 2. A journal reader could tell that somebody refused something without being able to tell what.
