---
title: Context projection
description: How a journal becomes the context a model reads, how it is measured, and what compaction may never touch
type: pattern
status: target
tags: [core, context, compaction]
---

The journal is the truth and the context is a projection of it. Nothing between the two is stored: the context is rebuilt for every call, from events, and a checkpoint only ever shortens that work.

## Blocks, not messages

The unit of projection is [[context-projection|the block]], never the message. A block is the smallest piece that may be dropped or kept whole:

- a user or assistant message is one closed block;
- a tool call and the result answering it are one closed block, because a result without its call is an answer to nothing and a call without its result is a question the model already asked;
- a call still waiting for its result is an open block, an obligation the run made.

A result whose call is missing stops the projection with a typed error. It is corruption, not an edge case.

## Composition before the call, tokens after it

Nothing measures a prompt in tokens before sending it. Providers count after the fact and report the number as usage, so an adapter answering a count beforehand can only estimate, and an estimate looks exactly like a measurement at the call site: everything deciding on top of it inherits an error nobody can see. `TokenCount` has no `estimate` constructor, and that absence is the rule.

What is knowable before a call is composition. Each category (runtime instructions, agent prompt, tool descriptions, conversation, tool results, active skills, summaries, media) is measured in characters of the canonical text and reported as a share of the whole. The fields are named `characters` and `share`, never `tokens`. A character is not a token, but the ratio between categories of the same prompt is stable enough to answer the only question anyone has beforehand: what is taking up the room.

The absolute size arrives with `ModelUsage`, in the chunks of the call that already happened. Turning a share into tokens (`share × inputTokens`) is attribution of a measured number, and `ContextComposition.attribute` is named for it.

Counting before a call exists only where a provider truly offers it. `LlmModel.countTokens` is optional and gated by `ModelCapability.TOKEN_COUNTING`: Gemini declares it, OpenAI does not, and the runtime never asks an adapter for a number it would have to invent.

## An unknown window degrades out loud

`ModelDescriptor.contextWindow` is a `ContextWindow`, and a provider that never declared one gets `UnknownContextWindow` rather than a number someone invented. Against it:

- composition is still measured;
- nothing is ever refused, since refusing against an unstated limit invents the limit;
- the runtime reports the unknown window once per model, through `ContextNoticeSink`;
- compaction still runs, because a compaction policy declares its own absolute ceiling and does not read the window.

The rule is that degrading is fine and degrading silently is not.

## Free room needs both halves

`ContextBudget` answers only when a window was declared **and** a call reported usage. Either half missing means the answer is absent rather than zero, because a zero here reads like room to spare.

Measured and projected are different words for different facts, and the API keeps them apart. `usedTokens` is what the provider counted for the previous call, unscaled, and it is a `TokenCount`. `projectedTokens`, `projectedFreeTokens`, `projectedUsedShare` and `projectedFreeShare` carry that measurement to the prompt as it now stands, scaled by how the character count changed, and they answer plain numbers: a `TokenCount` means somebody counted, and there nobody did.

Every question about the call that has not happened yet is necessarily a projection, because the only thing that knows the real size of this prompt is the provider and asking it is the call. So `verify` refuses on the projection and `ContextBudgetExceededError` says `projects` rather than `needs`. What it never does is invent one: an unknown window, or a session no provider has measured, goes through untouched.

A measurement belongs to the model that produced it. `PromptMeasurement` carries the `ModelIdentity`, and `takenBy` answers absence when a different model is the one about to be called: providers tokenize differently, and carrying a count across a failover would measure one window with another's ruler.

Compaction decides on the projection rather than the measurement, and targets a share of the current prompt rather than a token count. Compacting a turn early costs some room; compacting a turn late costs the call.

## What compaction may not do

Compaction produces another projection. It never mutates the one it was given, which is why `PreparedModelContext` deep freezes itself: a strategy written as a mutation fails loudly instead of changing what a previous call already measured.

It may drop closed blocks, oldest first, outside the recent ones the decision protects. It may never split a causal pair or touch an open obligation.

A summary costs tokens like anything else, so writing one reopens the question of whether the result fits. A strategy that cannot have both gives up the summary, not the target.

## Checkpoints are disposable

`ContextCheckpoint` lives in a logical collection of `SessionStorage` that is not the journal: no contiguous revision, no optimistic concurrency, written outside the commit transaction, idempotent by session, covered revision and strategy version. Failing to write one never fails the call that produced it.

It carries the stable prefix digest, which covers instructions and tool declarations and deliberately excludes the conversation. Compaction leaves that digest byte identical; a prompt or a toolset that changed does not, and the checkpoint is discarded. So is one written by another strategy or another version of it. Discarding is always silent and always safe: the journal rebuilds everything.

Related: [[llm-model]], [[agent]], [[layer-boundaries]], [[error-taxonomy]].

## An activated skill is pinned where it landed

A skill the model loaded arrives as the result of the `activate_skill` call that asked for it, and it stays there. Nothing is copied to the front of the prompt: a skill loaded halfway through a session must not invalidate the cache of everything before it.

`SkillActivated` names the `callId` whose result carries the content. The projector marks that exchange `ACTIVE_SKILLS` and pins it, and a pinned block is not removable however old it gets. Dropping it would take back knowledge the model is expected to still have, while a marker saying the skill is active survived.

A skill scoped to a run stops being pinned once another run is asking, which is what makes the scope mean anything. A session scoped one stays pinned for the session.

## Still missing

- cache read accounting and cost, which build on the same usage;
- `TestingAgent.requests`, which exposes the prepared context per run and replaces the static context diagnostics;
- an artifact digest covering bytes, media type and length rather than text alone.
