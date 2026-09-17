---
"@nestjs-adk/core": major
"@nestjs-adk/google": major
"@nestjs-adk/openai": major
---

Safe defaults out of the box, and every policy the runtime consults is now a component you can replace.

A destructive tool waits for a person unless you say otherwise: `RuntimeOptions.tools.approvals` defaults to `EffectApprovalPolicy.destructiveOnly()` instead of `never()`. The trade is not symmetric. The cost of this default being wrong is a run that waits for a click; the cost of the old one being wrong is a refund nobody agreed to. Say `EffectApprovalPolicy.never()` to run everything unattended.

A run stops after fifty iterations unless you say otherwise. `RunLimits.maxIterations` was absent by default, which read as trust and behaved as a bill: a model looping on a tool it cannot satisfy spent money until somebody noticed. `RunLimits.unbounded()` takes the ceiling off, and it is a declaration rather than a field left out.

`OffloadPolicy`, `SnapshotPolicy`, `EventRedactor` and `CompactionStrategy` are ports now, each with the old behavior shipped as a class you can keep: `CharacterCountOffloadPolicy.byDefault()`, `RevisionBucketSnapshotPolicy.everyFiftyEvents()`, `new FieldNameEventRedactor(["senha"])` and `OldestFirstCompactionStrategy`. All four are declared in `RuntimeOptions`, which is how `ContextSummarizer` and `PricingSource` already arrive, so a component the container built reaches the runtime through the same seam.

`MeteredEmbedder` is gone. `Embedder.embedMetered` answers for every embedder, defaulting to a usage of nothing under an identity taken from the class name, so `PricedEmbedder` no longer asks what kind of embedder it was handed. An embedder whose provider reports usage overrides the method.

`GeminiOptions.apiKey` and `OpenAiOptions.apiKey` take a `Secret` or a plain string. Whatever they are handed is wrapped at the option boundary and revealed once, at the call that builds the SDK client, so a key never travels as a bare string that a log can print.

Deleting a conversation now goes through `SessionService.delete`, which removes the journal, its artifacts and what the attachment cache was holding for it. That cache is keyed by session and id, and a delete behind its back left it answering with bytes that no longer exist; `AttachmentReader.forget(context)` is public for an application that deletes through the port itself.
