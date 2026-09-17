---
title: Context projection
description: How a journal becomes the context a model reads, how it is measured, when it is compacted by default, and what compaction may never touch
type: pattern
status: target
tags: [core, context, compaction]
---

The journal is the truth and the context is a projection of it. Nothing between the two is stored: the context is rebuilt for every call, from events, and a checkpoint only ever shortens that work.

## Blocks, not messages

The unit of projection is [[context-projection|the block]], never the message. A block is the smallest piece that may be dropped or kept whole:

- a user or assistant message is one closed block;
- a tool call and the result answering it are one closed block, because a result without its call is an answer to nothing and a call without its result is a question the model already asked;
- calls the model made in one breath, back to back with nothing conversational between them, are one block too, calls first and every result after them: that is the turn the provider produced and reads back, and a thinking model's reasoning belongs to that turn and not to a pair cut out of it;
- a call still waiting for its result is an open block, an obligation the run made.

A result whose call is missing stops the projection with a typed error. It is corruption, not an edge case.

## Characters before the call, tokens after it

Nothing measures a prompt in tokens before sending it. Providers count after the fact and report the number as usage, so an adapter answering a count beforehand can only estimate, and an estimate looks exactly like a measurement at the call site: everything deciding on top of it inherits an error nobody can see. `TokenCount` has no `estimate` constructor, and that absence is the rule.

What is knowable before a call is size in characters of the canonical text, which is what `ContextMeasurer` answers: one number, never a token count. A character is not a token, but the ratio between two measurements of the same conversation is stable enough to carry a past measurement forward, which is the only thing anyone needs beforehand.

The absolute size arrives with `ModelUsage`, in the chunks of the call that already happened. The two travel together as `PromptMeasurement`: the tokens the provider counted, the characters they were counted over, and the model that counted them. None of the three means anything without the other two.

There used to be a per category breakdown here, splitting the prompt across runtime instructions, agent prompt, tool descriptions, conversation, tool results, active skills, summaries and media, and attributing measured tokens to each by character share. It was removed because nothing read it: no policy decided on a category, the checkpoint stored one nobody loaded, and the attribution had no caller at all. `ContextBlock.category` stays, because a block is classified by what it is; what left is the arithmetic on top of it.

Counting before a call exists only where a provider truly offers it. `LlmModel.countTokens` is optional and gated by `ModelCapability.TOKEN_COUNTING`: Gemini declares it, OpenAI does not, and the runtime never asks an adapter for a number it would have to invent.

## An unknown window degrades out loud

`ModelDescriptor.contextWindow` is a `ContextWindow`, and a provider that never declared one gets `UnknownContextWindow` rather than a number someone invented. Against it:

- the prompt is still measured in characters;
- nothing is ever refused, since refusing against an unstated limit invents the limit;
- the runtime reports the unknown window once per model, through `ContextNoticeSink`;
- the standard policy compacts nothing, because a share of an unbounded window is never passed. An application that wants a conversation shortened anyway states the size itself, by extending `AdkCompactionPolicy`.

The rule is that degrading is fine and degrading silently is not.

## Compaction is on unless somebody turned it off

An application that declares nothing is compacted at nine tenths of the window, down to seven tenths, keeping the four most recent blocks. That is `WindowShareCompactionPolicy`, and the default exists because the alternative was worse: before it, a conversation nobody had thought about grew until the window refused the call, and the failure arrived at the customer rather than at the developer. The shares match what Cline and Cursor do, and they are shares rather than counts because two hundred thousand tokens is comfortable in a window of a million and impossible in one of a hundred and twenty eight thousand.

Three levels declare it, resolved in `RunScopeFactory.compactionFor`: the agent's `@Agent({ compaction })`, then `RuntimeOptions.context.compaction`, then the standard policy. `false` at either level turns compaction off, and it is a declaration rather than an absence: an agent that refuses compaction keeps refusing it under a runtime that declared a policy, and `??` is what keeps the three readable, since it falls through on `undefined` and never on `false`.

An agent that turned it off and outgrows its window gets `ContextBudgetExceededError`, which is the honest end. The alternative is dropping the beginning of a conversation somebody said to keep whole.

## Free room needs both halves

`ContextBudget` is a `ContextWindow` plus a `PromptMeasurement` plus how large the prompt is now. It answers only when a window was declared **and** a call reported usage. Either half missing means the answer is absent rather than zero, because a zero here reads like room to spare.

Given no current size it stands on the measured one, which is a budget about the call that happened rather than one about to happen. That is what `AgentHandle.contextBudget(sessionId)` answers: the window comes from the agent's own model, the measurement from the journal, and no projection is built, because building one means resolving tools, instructions and an agent's own `prompt()`, all of which belong to a run.

Measured and projected are different words for different facts, and the API keeps them apart. `usedTokens` is what the provider counted for the previous call, unscaled, and it is a `TokenCount`. `projectedTokens`, `projectedFreeTokens`, `projectedUsedShare` and `projectedFreeShare` carry that measurement to the prompt as it now stands, scaled by how the character count changed, and they answer plain numbers: a `TokenCount` means somebody counted, and there nobody did.

Every question about the call that has not happened yet is necessarily a projection, because the only thing that knows the real size of this prompt is the provider and asking it is the call. So `verify` refuses on the projection and `ContextBudgetExceededError` says `projects` rather than `needs`. What it never does is invent one: an unknown window, or a session no provider has measured, goes through untouched.

A measurement belongs to the model that produced it. `PromptMeasurement` carries the `ModelIdentity`, and `takenBy` answers absence when a different model is the one about to be called: providers tokenize differently, and carrying a count across a failover would measure one window with another's ruler.

Compaction decides on the projection rather than the measurement, and targets a share of the current prompt rather than a token count. Compacting a turn early costs some room; compacting a turn late costs the call.

## The strategy is a component like the policy

The policy answers whether and how much; `CompactionStrategy` answers how, and it is declared in `RuntimeOptions.context.compactionStrategy` rather than constructed inside the composition. `OldestFirstCompactionStrategy` is what ships, and it is built there rather than defaulted in the options because it needs the measurer and the summarizer the runtime composes.

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
