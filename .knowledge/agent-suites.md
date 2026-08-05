---
title: Agent suites against a real provider
description: What the real-provider tests are for, why they are tiny, and which Gemini model can actually finish a tool loop
type: convention
tags: [testing, google, gemini, cost]
---

`*.agent.spec.ts` files talk to a real provider. They are excluded from `npm run test` and run with `npx vitest run --project agents`. Without `GEMINI_API_KEY` the whole suite skips, so CI never fails for want of a key.

## What they are for

Everything a fake can prove is proved against a fake: faster, deterministic, free. These suites exist for the one thing a fake cannot answer, which is whether the request this runtime builds is one the provider actually accepts, and whether the answer it sends back is one this runtime can read.

So every case is the smallest question with one right answer: a greeting, one tool call, one handover. A suite that costs real money has to earn every call it makes.

## `flash-lite` cannot finish a tool loop

Measured, not guessed: `gemini-2.5-flash-lite` answers a plain question reliably and, on the turn **after a function response**, returns an empty candidate: no parts, `finishReason: STOP`, zero output tokens. Three out of three, against the raw SDK with no runtime in the way. `gemini-2.5-flash` answers three out of three on the same conversation.

The runtime is right to fail that run with `EmptyModelResponseError`, so the split is in the fixture and not in a workaround:

- `cheapModel()` is `flash-lite`, for a question the model answers on its own;
- `toolModel()` is `flash`, for anything that goes model, tool, model again.

## Keeping the bill small

- `maxOutputTokens` is capped at a couple of hundred: enough for a sentence or a tool call.
- `temperature: 0`, so a passing test keeps passing.
- Questions are asked in the language the answer is asserted in, and assertions look for a value only a tool could have produced (a number the model cannot guess) rather than for prose.
- Compaction is deliberately **not** in these suites. What has to be true about it is that a long conversation is shortened and that the journal is untouched, and neither depends on a provider being clever: it is proved against a scripted model in `auto-compaction.e2e.spec.ts`.

Related: [[agent-transfer]], [[agent-delegation]].
