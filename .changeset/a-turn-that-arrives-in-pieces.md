---
"@nestjs-adk/testing": minor
---

A scripted turn can arrive in pieces, and the bed can watch a run.

`stream` is public API on `AgentHandle` and on `AdkAgent`, and nothing outside the core exercised it: `ScriptedModel` sent every answer as a single chunk and `TestAgent` had no way to consume a generator. So a caller that consumed `stream` had no offline level to be tested at.

```ts
script.mockStream(["A garantia ", "é de 90 ", "dias."]);

const run = await bed.agent(WarrantyAgent).stream("qual a garantia?");
run.textDeltas;    // ["A garantia ", "é de 90 ", "dias."]
run.wasStreamed;   // true
run.text;          // "A garantia é de 90 dias."
```

`mockText` still sends one chunk, which is what a provider sends with streaming off, and that is the reason `mockStream` exists rather than being the default: against a single chunk, a caller that collects the whole answer and paints it once at the end passes exactly like one that paints as it goes. Scripting the pieces is what tells the two apart.

`TestAgent.stream` answers a `StreamedRun`, which extends `RecordedRun` rather than wrapping it, so every matcher and every assertion already written about a run keeps working and the chunks travel with it. It drains the generator on the test's behalf, because `AgentHandle.stream` returns the result as the generator's return value and a `for await` silently discards it.
