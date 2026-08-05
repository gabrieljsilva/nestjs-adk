---
"@nestjs-adk/core": major
"@nestjs-adk/google": major
"@nestjs-adk/testing": major
---

Models you can type, runs you can price, and context you can test.

This release closes the loop between the three things a team asks in order, as an agent product matures: *can I configure the model properly?*, *what is this costing me?*, and *why is it costing that much?*

## Breaking

The embedder contract changed shape. `Embedder` is now `AdkEmbedder`, and `Embedder` became the decorator that declares the model, the same `@Agent`/`AdkAgent` pairing used everywhere else in the library. You implement `generate()` and the base class handles pricing; `embed()` is no longer yours to write.

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

`AdkEngine` gained an `explain()` method. It ships with a concrete default that reports nothing, so existing engines keep compiling. Override it if your adapter can describe its native request.

## Typed model specs and custom models

Gemini generation parameters are typed at last: `temperature`, `topP`, `topK`, `maxOutputTokens`, `frequencyPenalty`, `presencePenalty` and `stopSequences` are real fields, so a typo fails the build instead of being silently dropped. The `config` escape hatch stays for everything else, and typed fields win over it.

This also fixes a silent bug: a `Gemini` spec used as a `ModelRouter` target or as the compaction summarizer used to lose its `config` and `labels`. Configuration now applies at the model boundary, so every target keeps its own parameters.

`createModelSpec<Map>` restricts options per model name when a model does not accept a given parameter. The capability map belongs to you, since the library does not ship one that would go stale.

And `AdkModel` lets you plug in a provider the library knows nothing about. It is an abstract class in the core with full dependency injection, referenced as `@Agent({ model: MyModel })` or as a router target, over a neutral contract that covers streaming, multi-part content, function calling, usage and structured output.

## Cost per run

`forRoot({ pricing: new LiteLLMPricingSource() })` turns on cost tracking, fed by the catalog LiteLLM maintains: fetched, projected to token rates, stored and revalidated every four hours at runtime, with no build step. `run.cost` reports the total, the breakdown per model and the models that had no price, and the same numbers reach the `final` event and the run log.

Each call is billed under the model that actually served it, so router failovers and compaction summaries land on their own line. Cached prompt tokens are charged at the cache rate, and context bands follow the real token count.

Nothing is guessed: an unknown or partially priced model is listed in `unpriced` and left out of the total. A failed fetch keeps the catalog already loaded, and pricing never blocks boot nor interrupts a run. Storages ship for the three lifetimes that matter: `InMemoryPricingStorage` (default), `FileSystemPricingStorage` and `RedisPricingStorage`, the last one letting replicas share a single fetch.

## Costs you can post to a ledger

`CallCost` gained `breakdown` (`input`, `output`, `cached` as separate amounts) and `rates`, the per-token rates actually applied to that call, after context bands and overrides. `ModelCost` aggregates the same breakdown per model, without rates, since calls of different prompt sizes can land in different bands and one rate for the aggregate would be a fiction.

The split was always computed and thrown away in the final sum. Consumers that bill these numbers had to either re-derive the parts by dividing a float, or give up and pass an aggregate to a schema expecting three columns. With integer token counts and per-token rates, a decimal ledger can now multiply them itself instead of inheriting our floating point.

`llmCost()` returns `{ amount, breakdown, rates }` instead of a bare number.

## Token streaming

`forRoot({ streaming: true })`, or `streaming` per call, asks the model for incremental output. The same turn then also emits `llm_response` events flagged `partial: true`, so a UI can render text as it is produced.

The provider still sends the aggregated response at the end of the turn, which is why the flag exists: appending every `llm_response.text` would duplicate the answer. Discarding the aggregated one is the opposite trap, and the quieter one: with streaming off, or a provider falling back mid-run, no partial ever arrives and the user sees nothing. Hold the aggregated response and use it only when the turn produced no partials.

`ScriptedEngine` gained a `deltas([...])` turn that emits the partials followed by the aggregated response, exactly as a provider does. Without it, a streaming test asserts against an engine that only ever sent the aggregate: neither bug above is reachable, and the test passes while proving nothing.

`ask()` is unaffected, and token counts are still reported once, so streaming changes neither `usage` nor `cost`.

Off by default, so the previous behaviour, one response per turn, is unchanged.

## Tool arguments are validated

Tool input is parsed with the declared Zod schema before `execute` runs. Until now engines handed the model's arguments over untouched, which made `z.infer` a type-level fiction and `.default()` a no-op and, more seriously, let any key the model invented reach the tool. The guidance to keep a tenant id in `ctx` instead of the schema meant little while the model could send one anyway and a `{ ...input }` spread could carry it into a query. Zod's strip closes that.

Invalid arguments go back to the model as a result rather than as an exception, because the model wrote them and usually fixes them on the next call, while throwing would kill a run over a missing field. `maxInvalidArgs` caps how many times per tool that happens before the run aborts with `ToolInvalidArgsError`. It resolves like the other limits (`ask()` > `@Agent` > `forRoot`) but defaults to `2` rather than unlimited: a schema the model cannot satisfy would otherwise retry forever on your bill. `0` aborts on the first invalid call.

## Approvals keep the run's state

`approve()` used to rebuild the state from the session alone, and the `state` given to `ask()` is per-call and never persisted, since only what a tool writes during the run is. Every tool with `requiresApproval` therefore resumed without scope, failing with `AgentStateMissingError` when the agent declared a state schema and, worse, executing with no owner when it did not.

`PendingApproval` now carries the state frozen when approval was requested, restored on `approve()` and carried into the rest of the resumed turn. The alternative, persisting `ask()` state into the session, would have turned every per-call value into a permanent one. The frozen scope is stored with the pending action, so `state` is not the place for credentials unless your `SessionStore` is.

## Attachments

`toolContent([{ data: { mimeType, base64 } }])` returns something the model looks at instead of something it reads. A function response is JSON, so an image inside one is characters the model can count and not see; wrapping the parts routes them through the provider's content channel, arriving in the same turn with the user's question already in context.

That ordering is what makes it worth doing. A description generated when the file was uploaded answers only the question somebody anticipated: "what colour is the shirt?" survives, "how many buttons?" does not. Looking at the file when it is asked also costs one call instead of two, and keeps the tokens inside `run.cost` rather than in a side call nothing reports.

Parts are routed by mime type: images, audio, video and PDF go inline; `text/*`, JSON, CSV, XML and YAML are decoded to characters; anything else is described with its type and size instead of being sent as bytes no model can parse. The payload is injected into the request and discarded with it, so it never enters the session history and a conversation full of attachments does not re-send all of them every turn.

`read_artifact` now covers the whole `ArtifactStore`, not just offloaded results: text comes back as a plain result, binary as an attachment. `ArtifactPart` gained `encoding` (`"utf8" | "base64"`) to tell the two apart. Unset, the mime type decides, which is what offloaded JSON and uploaded files already imply.

Context snapshots summarize binary parts to a head plus an exact length. Holding every attachment whole for the length of a run would have made the diagnostics the memory problem, and the summary stays deterministic, so stable-prefix verdicts are unaffected.

## Context and cache diagnostics

Providers discount tokens whose prefix they have already seen, and that only holds while the start of the context stays byte-for-byte identical between calls. A timestamp in the prompt or a tool catalog in shifting order kills the discount without changing a single answer: the bill notices, the test suite does not.

`forRoot({ diagnostics: true })` captures every model call as a normalized `ContextSnapshot`, split into `systemInstruction`, `toolDeclarations` and `contents`. Capture sits where the final request is assembled, so it works for a plain model id, a `Gemini` spec, an OpenAI-compatible endpoint, a router target or a custom `AdkModel`.

Two matchers consume it. `toHaveStablePrefix(threshold)` compares runs on the scripted model, measures how much of the context held still and, on failure, points at the segment and the exact text where they parted ways, so you find the volatile value instead of guessing. `toHaveCacheHitRatioAbove(threshold)` runs against the real provider and drops the warm-up run, since implicit caching only exists after somebody paid for the prefix. A run the provider said nothing about leaves the sample entirely rather than counting as zero cached, and if nothing was reported at all the matcher throws instead of failing, so the assertion cannot be satisfied by `.not`. Thresholds are always explicit: the instruction-to-history proportion varies too much between agents for a default to mean anything.

`AgentRunner.explain()` returns the context that would be sent, built through the real native pipeline and short-circuited before the provider: no tokens spent, with compaction skipped so a dry run never bills a summarizer call.
