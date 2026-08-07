---
title: Agent suites against a real provider
description: Where the real-provider tests live, why they run through the example application, and what a Gemini model can actually finish
type: convention
tags: [testing, playground, gemini, openai, cost]
---

`*.ai.spec.ts` files talk to a real provider. They live in `apps/playground/src/agents`, next to the agent each one exercises, and run with `npm run test:playground:agents`. Without `OPENAI_API_KEY` the whole suite skips, so CI never fails for want of a key.

The store runs on OpenAI in these suites. Gemini is kept for the one case that compares two providers and for the embedder behind it, because the shared Gemini tier answered 429 `RESOURCE_EXHAUSTED` under load often enough that a red suite stopped meaning anything.

The suffix is `.ai` and not `.agent` because `.agent` already names a production file: an agent class is `billing.agent.ts`, its paired unit spec is `billing.agent.spec.ts`, and for a while those specs were being routed into the paid project and skipped by `npm run test`. The suffix says what the file costs, not what it is about.

## They belong to the application, not to the library

The library has no provider suites. Everything it does against a real model is proved through the example store in `apps/playground`, booted by `aiStore()` with a provider behind every agent, because that is where the public API is the thing under test: an application declares `@Agent` and `@Tool`, injects a use case and asks a question. A suite that builds `DeclaredAgent` by hand and drives `AdkRuntimeHost` proves the runtime works and says nothing about whether anybody can use it.

The one exception is the API these suites are written with. `testing-api.ai.spec.ts` exercises the test bed itself against a provider: that a run a real model decided records the tools it reached for, that a double stands in for a tool the model chose to call, and that scripting one agent while another decides for itself works in a single run. Everything a fake can prove about that API is proved for free in `packages/testing`; this file is only for what a fake cannot.

## Paying for the decision and scripting the answer

A run reaches several agents, and usually only one of them is the thing under test. `withModelFor` puts a provider behind that one and `withScript` answers for the rest, so a transfer or a delegation costs one call instead of three. See [[test-bed]].

One file per agent, not per feature. A real conversation does several things at once, so the scenarios follow the sector they happen in: sales calls tools and gets judged, warranty looks at photos and delegates, billing waits for a human, the concierge routes and remembers.

## What they are for

Everything a fake can prove is proved against a fake: faster, deterministic, free. These suites exist for the one thing a fake cannot answer, which is whether a real model, given the prompts and the tools this application declares, does the thing the application was built around.

So every case is the smallest question with one right answer, and the assertion is a value only a tool could have produced. Three copies of a game the catalog prices at 279,90 come to 755,73 after the bulk discount, and the model was never told any of that: an answer carrying that number went through the tool. A suite that costs real money has to earn every call it makes.

## What each provider demands, measured

**`gpt-5.6-luna` refuses tools while it is reasoning.** On `/v1/chat/completions`, any request declaring function tools comes back 400: "Function tools with reasoning_effort are not supported ... use /v1/responses or set reasoning_effort to 'none'". Every agent in the store has tools, so the suite sends `reasoning_effort: "none"` through the adapter's body passthrough.

**Structured output is enforced only in the strict subset.** A schema that leaves an object open comes back as 400 "'additionalProperties' is required to be supplied and to be false", and the same applies to a property missing from `required`. Gemini accepts either shape through `responseJsonSchema`, so this only appears when a schema written against one provider meets the other, which is what the two model case exists to catch. The OpenAI adapter now checks the schema before sending and names the object that is open: see [[error-taxonomy]].

## What Gemini 3.5 demands, measured against the raw SDK

Three findings, each of which cost a red suite before it was understood. They live here because they are provider behaviour, not library design, and the next person to touch the fixture will need them.

**Thinking is a level, not a budget.** `thinkingConfig: { thinkingBudget: 0 }`, which is how 2.5 was told not to think, is a 400 with `INVALID_ARGUMENT` on 3.5. `thinkingLevel: "low"` is accepted and answers with zero thought tokens.

**A parallel call is streamed unsigned.** Asked for two tools at once, the provider sends one call per chunk and puts the `thoughtSignature` on the first one only. Sent back as two turns, the unsigned one is a 400 naming the tool. The adapter folds an unsigned call into the signed answer before it, which is the shape the provider documents.

**A call written by another provider needs a placeholder signature.** Measured before the adapter handled it: with the concierge on OpenAI and the warranty sector on `gemini-3.5-flash-lite`, the transfer landed and the next call was a 400, "Function call is missing a thought_signature in functionCall parts ... `transfer_to_agent`", and the run died with `ModelsExhaustedError`. The call that moved the conversation was written elsewhere and had no signature Gemini would accept.

The adapter now fills those in with the dummy signature Google documents for this exact case, scoped to the turn being answered, which is the only stretch Gemini validates. See [[cross-provider-history]] for what that costs and where the rule lives. The same fix covers a failover that reroutes a turn from one provider to another, which is the more common way a conversation changes model.

Delegation was already clean, and the difference is the context: a delegate is handed a task and starts from nothing, so nothing another provider wrote reaches it. That is still the shape `concierge.ai.spec.ts` uses for the cross provider case, because it costs one call less.

The other direction is a different problem and not fixed: asked about a broken product, `gemini-3.5-flash-lite` as the concierge answers in prose instead of reaching for `transfer_to_agent` at all.

**The index counts calls in an answer, not in a chunk.** Both parallel calls arrive as part zero of their own chunk, so an index counted per chunk collides and the executor concatenates their arguments into one call: `{"orderId":"A-1042"}{"plan":"gold"}`.

The older finding still holds for anyone on 2.5: `gemini-2.5-flash-lite` answered a plain question reliably and, on the turn **after a function response**, returned an empty candidate with `finishReason: STOP` and zero output tokens, three out of three. The runtime is right to fail that run with `EmptyModelResponseError`.

## Keeping the bill small

- `maxOutputTokens` is capped at a couple of hundred: enough for a sentence or a tool call.
- `temperature: 0`, and `thinkingLevel: "low"`, because these questions have one right answer and reasoning only spends tokens.
- Questions are asked in the language the answer is asserted in.
- `fileParallelism: false`, and a pause between cases: four suites at once on one key spend the per minute quota on 429s instead of on answers.
- The judge and the embedder are calls too. A rubric is worth one when the wording moves every run; `toContain` on a number is free and is the first choice.

Related: [[agent-transfer]], [[agent-delegation]], [[testing-conventions]].
