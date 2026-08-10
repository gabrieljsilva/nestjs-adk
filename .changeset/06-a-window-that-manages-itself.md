---
"@nestjs-adk/core": major
---

Conversations are compacted by default, and an application can read how full the window is.

Before this, compaction was off unless the application declared a policy, and a policy took absolute token counts. Both were wrong in the same way. A conversation nobody had thought about grew until the window refused the call, so the failure arrived at the customer rather than at the developer; and an absolute count is not portable, since two hundred thousand tokens is comfortable in a window of a million and impossible in one of a hundred and twenty eight thousand.

`WindowShareCompactionPolicy` decides in shares of the model's own window. Declaring nothing gets it: compaction at nine tenths, down to seven, keeping the four most recent blocks, which is what Cline and Cursor do.

```ts
new WindowShareCompactionPolicy({ maxShare: 0.9, targetShare: 0.7, keepRecentBlocks: 4 })
```

`compaction: false`, on the agent or on the runtime, turns it off for a conversation that may not lose a word, and that conversation is then refused with `ContextBudgetExceededError` rather than losing its beginning quietly. Without a summarizer declared, compaction drops rather than summarizes.

A model that never declared a window is never compacted, because a share of an unstated limit is a number this library will not invent. The unknown window is still reported once per model through `ContextNoticeSink`, and an application that wants a conversation shortened there says the size itself by extending `AdkCompactionPolicy`.

`AgentHandle.contextBudget(sessionId)` is the meter, and it runs no turn. It answers the window of the agent's model together with what the provider counted for the last call, so a conversation nobody has asked anything in reports a window and no size, and so does one continued under a different model until that model answers once. This is the meter and not what decides compaction: that decision is taken during a run, on the prompt about to be sent, by the policy the agent runs under.

**Breaking:** compaction runs where nothing is declared. An application that relied on conversations never being shortened declares `compaction: false`.
