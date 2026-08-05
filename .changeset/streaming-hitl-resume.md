---
"@nestjs-adk/core": major
---

The resumed turn streams, and the approved tool's result arrives in band.

`approve()` and `reject()` used to end in an aggregated `RunResult`, so everything after the human decision arrived at once: no deltas for the UI, no per-event billing, and the executed tool's result survived only interpolated inside a `[system]` message, leaving the row drawn as "awaiting approval" wrong forever.

## Breaking: the verbs are grouped by delivery

`agent.stream` is no longer a method; it is the streaming face of the handle. Same three verbs, one axis for what to do and one for how to receive it:

```ts
await agent.ask(input);                  // Promise<RunResult>
await agent.approve(params);             // Promise<RunResult>
await agent.reject(params);              // Promise<RunResult>

agent.stream.ask(input);                 // AsyncGenerator<AgentEvent>
agent.stream.approve(params);            // AsyncGenerator<AgentEvent>
agent.stream.reject(params);             // AsyncGenerator<AgentEvent>
```

Migration is mechanical: `agent.stream(input)` becomes `agent.stream.ask(input)`. `AgentRef` and `AdkWorkflow` follow the same shape. The new `AgentStream`, `ApproveParams` and `RejectParams` types are exported.

## The approved call's result is an event

The first event of `stream.approve()` is a `tool_result` carrying the ORIGINAL `callId` and the executed tool's real result. It is what lets a UI replace its "awaiting approval" row instead of showing it forever, and everything after it is the resumed run, streaming through the same event loop, billing and persistence path as any other turn. The aggregated `approve()` consumes the same stream, so the `tool_result` now appears in `RunResult.events` too.
