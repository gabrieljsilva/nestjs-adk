---
title: The test bed
description: How a test replaces the model of one agent, what it asserts on, and why the bed refuses to boot
type: pattern
tags: [testing, nestjs, agents, models]
---

`@nestjs-adk/testing` boots the application a consumer wrote and lets a test decide what each agent answers on. Nothing is rebuilt: the container, the decorators, the catalog, the journal and the approval policy are the ones production uses, and the model is the only piece that changes.

```ts
const bed = await AdkTestBedBuilder.for({ imports: [AppModule] })
  .withScript(BillingAgent, (script) => script.mockToolCall("find_order", { orderId: "A-1042" }).mockText("349 reais"))
  .boot();

const run = await bed.agent(BillingAgent).ask("Quanto custou o pedido A-1042?");

expect(run).toHaveRunTool("find_order", { orderId: "A-1042" });
```

## One script per agent

A single script shared by every agent is how turns slip: a transfer or a delegation reaches a second agent, which consumes a turn the first one was queued for, and the failure appears three assertions later. `withScript` binds a script to one agent, so a run that hands work to another sector reads as what it is.

Scripts are strict. A run that asks for a turn nobody queued fails naming the agent, instead of answering a silent default and letting the test pass for the wrong reason. `bed.verify()` fails the other way, when the test described a conversation the run never had.

## The model is decided per agent

`withModelFor` installs a `RoutingModelResolver` on the runtime's own `ModelResolver` port, which every entrypoint consults: `ask`, a transfer, a delegation and a resumed approval each resolve again. That is what makes a mixed run possible, and it is the reason a paid suite can pay for one decision and script the rest.

```ts
.withModelFor(ConciergeAgent, realModel)          // the decision is worth paying for
.withScript(WarrantyAgent, (s) => s.mockText(…))  // the answer is not
```

`withModel` replaces only the module's fallback, so an agent that declared `model` in `@Agent` keeps it, exactly as in production. Routing one of those is `withModelFor`, which is deliberately explicit.

## The bed refuses to boot

An agent whose model the test never chose fails the boot, naming the agents. The question is not whether the model is a script: it is whether the test knows what each agent runs on. A model inherited from a decorator or from the module default is how a suite meant to be free reaches a provider and bills somebody. A suite that means it says so with `allowingUnscriptedModels()`.

## Assertions read the run, not the double

`ask` answers a `RecordedRun`: the `AgentResult` production returns, carrying the events of that run. Every matcher reads those events, so the same assertion holds whether a script or a provider decided, and a suite of several runs never has to correlate anything by hand.

- `toHaveRunTool(name, args?)` a tool that answered, optionally with these arguments
- `toHaveRequestedTool(name)` a tool the model asked for, run or not
- `toAwaitApproval(tool?)` the run stopped in front of a human
- `toHaveDeniedTool(name)` a human refused it and the conversation carried on
- `toHaveTransferredTo(agent)` / `toHaveDelegatedTo(agent)`
- `toSatisfyRubric(judge, criteria)` for prose, where a string match either breaks on a rewrite or asserts nothing

A call waiting on a human is `pending` and not run, which is the distinction an approval test is about.

## Testing the caller instead of the agent

A use case that hands a request to an agent has one job, which is handing over what the request said. `AgentStub` records what arrived and answers a constant, with no runtime under it. It is the wrong tool for anything about a session, a tool or a model: that is what the bed is for.

Related: [[testing-conventions]], [[agent-suites]], [[tool-doubles]], [[nest-composition-timing]].
