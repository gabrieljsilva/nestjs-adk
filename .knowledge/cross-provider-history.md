---
title: A conversation that changes provider
description: What breaks when a history written by one model is replayed to another, and where the adapter compensates
type: pitfall
tags: [gemini, openai, models, failover, transfer, adapters]
sources:
  - https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures
---

A session does not stay on one model. Three things move it, and only the first is obvious:

- **A transfer** hands the session to an agent that may run somewhere else, and the new agent replays the journal, which contains what the old model wrote. See [[agent-transfer]].
- **A failover** reroutes the same turn to the next model in the chain. `ModelRunner` re-sends the request unchanged and only swaps the model, so the second provider is handed the first one's history mid turn. The chain is declared on the model: see [[llm-model]].
- **A `ModelResolver`** can route any agent anywhere, at any hop.

Delegation is the exception: a delegate is handed a task and starts from an empty context, so nothing another provider wrote reaches it. See [[agent-delegation]].

## What Gemini 3 demands

Gemini 3 attaches a `thoughtSignature` to a `functionCall` it generates, and validates that it comes back. The rules, from Google's page:

- Validation covers **the current turn only**. Walking newest to oldest, the turn starts at the last user message with standard content, which is never a `functionResponse`. Nothing before that is checked.
- Only the **first `functionCall` part of each step** must carry one. A parallel call after it is exempt.
- Omitting it is a 400 naming the tool.

A call written by OpenAI has no such signature, so the run dies. Worse, it dies in the way that reads least like what happened: the failure is a 4xx, `GeminiFailureMapper` classifies it `InvalidRequestFailure`, and a refused request is the one failure a chain must not answer by trying the next model, so `SequentialFailoverPolicy` correctly stops on it (see [[error-taxonomy]]). The error that surfaces is a malformed request naming a tool. It points at the tool's schema when the cause is the provider boundary. That is `ModelsExhaustedError` from a failover that had somewhere left to go.

## What the adapter does about it

`GeminiRequestMapper` fills an unsigned call in the current turn with `skip_thought_signature_validator`, the placeholder Google documents for "transferring a trace from a different model that does not include thought signatures".

`signsFunctionCalls` decides who gets it: every name except one that states a generation below 3. The default that way round was measured. `gemini-flash-latest` answers as `gemini-3.6-flash` and refuses an unsigned call, so reading Google's own moving alias as an old model reopens the bug; and `gemini-2.5-flash-lite` was sent a signature it never issued and answered normally, so the opposite mistake costs nothing.

Two things about that are deliberate:

**The placeholder never leaves the mapper.** It is a wire value. Stored on `ToolCallMessage.signature` it would be indistinguishable from a signature the provider actually gave, and the next reader would send a real one that is not real.

**The rule does not need to know who wrote the call.** It looked like it would: mark each call with the model that produced it, then degrade the foreign ones. It buys nothing, because on 3.x any unsigned call opening a step in the current turn is refused regardless of origin, and on 2.5 nothing is validated. Provenance would improve the answer, not the correctness, and it costs an event schema version that every session already on disk has to be decoded through.

The cost is real and worth naming: Google calls injecting synthetic function-call blocks strongly discouraged and says the model reasons worse without the true signature. The trade is a possibly weaker answer instead of a dead run, made for a handover the application never asked about, and it is not made for calls Gemini itself signed.

## The other direction

Replaying a Gemini history to OpenAI is safe: the OpenAI mapper never reads `signature`, so the field is simply dropped. OpenAI's own reasoning items have the same shape of problem, and the same asymmetry will apply the day the core carries them.

Two paid cases prove this against a real pair of providers, both in `apps/playground/src/agents/concierge.ai.spec.ts`: a transfer into an agent on another provider, and an approval resumed on a provider that did not ask for it. Each was checked red before the fix and green after. A failover is not among them on purpose: it produces the same request through the same mapper, so what is left unproven there is the runtime handing the history over, and `ModelRunner` covers that offline. See [[agent-suites]].
