---
"@nestjs-adk/core": major
---

Conversations are compacted by default, and an application can read how full the window is.

Before this, compaction was off unless the application declared a policy, and a policy took absolute token counts. Both were wrong in the same way. A conversation nobody had thought about grew until the window refused the call, so the failure arrived at the customer rather than at the developer; and an absolute count is not portable, since two hundred thousand tokens is comfortable in a window of a million and impossible in one of a hundred and twenty eight thousand.

`WindowShareCompactionPolicy` replaces `TokenThresholdCompactionPolicy` and decides in shares of the model's own window. Declaring nothing gets it: compaction at nine tenths, down to seven, keeping the four most recent blocks, which is what Cline and Cursor do. `compaction: false` at either level turns it off for a conversation that may not lose a word, and that conversation is then refused with `ContextBudgetExceededError` rather than losing its beginning quietly.

A model that never declared a window is never compacted, because a share of an unstated limit is a number this library will not invent. The unknown window is still reported once per model through `ContextNoticeSink`, and an application that wants a conversation shortened there says the size itself by extending `AdkCompactionPolicy`.

`AgentHandle.contextBudget(sessionId)` is the meter, and it runs no turn. It answers the window of the agent's model together with what the provider counted for the last call, so a conversation nobody has asked anything in reports a window and no size, and so does one continued under a different model until that model answers once.

The per category composition is gone. It split every prompt across eight categories and attributed measured tokens to each by character share, and nothing read any of it: no policy decided on a category, the checkpoint stored one nobody loaded, and the attribution had no caller. `ContextBlock.category` stays, since a block is classified by what it is.

**Breaking:**

- `TokenThresholdCompactionPolicy` is now `WindowShareCompactionPolicy`, and it takes a named object: `new WindowShareCompactionPolicy({ maxShare: 0.9, targetShare: 0.7, keepRecentBlocks: 4 })`. The three numbers are no longer positional, and two of them are shares rather than counts.
- `InvalidCompactionThresholdError` now carries `maxShare` and `targetShare`.
- Compaction runs where nothing is declared. An application that relied on conversations never being shortened declares `compaction: false`, on the agent or on the runtime.
- `compaction` accepts `AdkCompactionPolicy | false` in `@Agent` and in `RuntimeOptions`.
- `ContextComposition`, `ContextCompositionEntry` and `ContextMeasurer.measure`'s return type are gone. The measurer answers a number of characters.
- `ContextBudget` now takes `(window, lastPrompt?, characters?)`, which is a `ContextWindow` plus a `PromptMeasurement`, replacing the window, composition, usage and character count it used to be handed apart.
- `ContextCheckpoint` no longer carries a composition, and neither does `CheckpointRecord`. A stored checkpoint that still has the column is read fine; the column is ignored and can be dropped.
- `PreparedModelContext.composition` is now `PreparedModelContext.characters`.
- `PrepareContextCommand` takes `lastPrompt` in place of `lastUsage` and `lastUsageCharacters`, so every parameter after it moved up one position.
- `PromptMeasurement` is now exported, which is what `SessionInspection.lastPrompt` and `ContextBudget.lastPrompt` have always answered.
