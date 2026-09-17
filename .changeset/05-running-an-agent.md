---
"@nestjs-adk/core": minor
---

A run can be stopped by whoever asked for it, and an agent can declare how long it may run.

## The stop button

`AskOptions` and `DecisionOptions` take a `signal`. Everything under the surface was already there: each run owns a cancellation, its signal reaches the tools and the model call, the provider adapters hand it to the SDKs, and the journal already writes a cancellation when a cancelled run ends. What was missing was the way in, so nothing an application held could stop one run.

Without it the best an application could do was stop reading the stream. The generator gets its `return()`, the interface stops showing text, and the run carries on inside the provider to the end: tokens generated and billed after the customer walked away, and a journal that closes the run as completed.

```ts
const controller = new AbortController();
request.on("close", () => controller.abort());

await support.ask("where is my order?", { sessionId, signal: controller.signal });
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
