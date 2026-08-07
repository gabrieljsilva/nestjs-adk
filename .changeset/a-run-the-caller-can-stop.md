---
"@nestjs-adk/core": minor
---

A run can be cancelled by whoever asked for it: `AskOptions` and `DecisionOptions` take a `signal`.

Everything under the surface was already there. Each run owns a `RunCancellation`, its signal reaches the tools and the model call, the provider adapters hand it to the SDKs, and the journal already writes `run.cancelled` when a cancelled run ends. What was missing was the way in: `ActiveRunTracker` only had `cancelAll`, used by the shutdown drain, so nothing an application held could stop one run.

Without it the best an application could do was stop reading the stream. The generator gets its `return()`, the interface stops showing text, and the run carries on inside the provider to the end: tokens generated and billed after the customer walked away, and a journal that closes the run as completed.

```ts
const controller = new AbortController();
request.on("close", () => controller.abort());

await support.ask("where is my order?", { sessionId, signal: controller.signal });
```

The signal is chained onto the run the way a delegation already chains onto its parent, so a cancelled run takes its children with it. One that has already aborted cancels the run before it calls anything, which is the moment the button is usually pressed: before the first chunk. `approve` and `reject` take one too, because a released turn is a run of its own, and a decision made minutes later deserves the same stop button.
