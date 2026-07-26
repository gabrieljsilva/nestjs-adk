---
"@nestjs-adk/core": major
"@nestjs-adk/google": major
"@nestjs-adk/testing": major
---

Models you can type, runs you can price, and context you can test.

This release closes the loop between the three things a team asks in order, as an agent product matures: *can I configure the model properly?*, *what is this costing me?*, and *why is it costing that much?*

## Breaking

The embedder contract changed shape. `Embedder` is now `AdkEmbedder`, and `Embedder` became the decorator that declares the model — the same `@Agent`/`AdkAgent` pairing used everywhere else in the library. You implement `generate()` and the base class handles pricing; `embed()` is no longer yours to write.

```ts
// before
@Injectable()
export class GeminiEmbedder extends Embedder {
  async embed(texts: string[]): Promise<EmbeddingResult> { /* ... */ }
}

// after
@Embedder({ model: "gemini-embedding-001", dimensions: 3072 })
export class GeminiEmbedder extends AdkEmbedder {
  protected async generate(texts: string[]): Promise<EmbeddingOutput> { /* ... */ }
}
```

`EmbeddingUsage.promptTokens` is now optional: a provider that reports no tokens leaves the call unpriced instead of having it counted as free.

`AdkEngine` gained an `explain()` method. It ships with a concrete default that reports nothing, so existing engines keep compiling — override it if your adapter can describe its native request.

## Typed model specs and custom models

Gemini generation parameters are typed at last: `temperature`, `topP`, `topK`, `maxOutputTokens`, `frequencyPenalty`, `presencePenalty` and `stopSequences` are real fields, so a typo fails the build instead of being silently dropped. The `config` escape hatch stays for everything else, and typed fields win over it.

This also fixes a silent bug: a `Gemini` spec used as a `ModelRouter` target or as the compaction summarizer used to lose its `config` and `labels`. Configuration now applies at the model boundary, so every target keeps its own parameters.

`createModelSpec<Map>` restricts options per model name when a model does not accept a given parameter. The capability map belongs to you — the library does not ship one that would go stale.

And `AdkModel` lets you plug in a provider the library knows nothing about. It is an abstract class in the core with full dependency injection, referenced as `@Agent({ model: MyModel })` or as a router target, over a neutral contract that covers streaming, multi-part content, function calling, usage and structured output.

## Cost per run

`forRoot({ pricing: new LiteLLMPricingSource() })` turns on cost tracking, fed by the catalog LiteLLM maintains: fetched, projected to token rates, stored and revalidated every four hours at runtime, with no build step. `run.cost` reports the total, the breakdown per model and the models that had no price, and the same numbers reach the `final` event and the run log.

Each call is billed under the model that actually served it, so router failovers and compaction summaries land on their own line. Cached prompt tokens are charged at the cache rate, and context bands follow the real token count.

Nothing is guessed: an unknown or partially priced model is listed in `unpriced` and left out of the total. A failed fetch keeps the catalog already loaded, and pricing never blocks boot nor interrupts a run. Storages ship for the three lifetimes that matter — `InMemoryPricingStorage` (default), `FileSystemPricingStorage` and `RedisPricingStorage`, the last one letting replicas share a single fetch.

## Context and cache diagnostics

Providers discount tokens whose prefix they have already seen, and that only holds while the start of the context stays byte-for-byte identical between calls. A timestamp in the prompt or a tool catalog in shifting order kills the discount without changing a single answer — the bill notices, the test suite does not.

`forRoot({ diagnostics: true })` captures every model call as a normalized `ContextSnapshot`, split into `systemInstruction`, `toolDeclarations` and `contents`. Capture sits where the final request is assembled, so it works for a plain model id, a `Gemini` spec, an OpenAI-compatible endpoint, a router target or a custom `AdkModel`.

Two matchers consume it. `toHaveStablePrefix(threshold)` compares runs on the scripted model, measures how much of the context held still and, on failure, points at the segment and the exact text where they parted ways — you find the volatile value instead of guessing. `toHaveCacheHitRatioAbove(threshold)` runs against the real provider and drops the warm-up run, since implicit caching only exists after somebody paid for the prefix. A run the provider said nothing about leaves the sample entirely rather than counting as zero cached, and if nothing was reported at all the matcher throws instead of failing, so the assertion cannot be satisfied by `.not`. Thresholds are always explicit: the instruction-to-history proportion varies too much between agents for a default to mean anything.

`AgentRunner.explain()` returns the context that would be sent, built through the real native pipeline and short-circuited before the provider — no tokens spent, with compaction skipped so a dry run never bills a summarizer call.
