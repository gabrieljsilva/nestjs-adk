---
"@nestjs-adk/core": major
"@nestjs-adk/testing": major
---

Every component of a run now reads the same object, and it is the first parameter of every port you implement.

## One context, two halves

`RunContext` is what a run is. Its durable half is the conversation — `sessionId`, the session's `metadata`, the `revision` its journal reached and the `activeAgent` answering — rebuilt from the session on every open rather than remembered between them. Its invocation half is this question and nothing else: `runId`, `startedAt`, `actor`, `signal`, `depth`, and `parent` for a delegation. It dies when the run settles.

`SessionContext` is that durable half on its own, and `RunContext` extends it. It exists because some things happen to a conversation with no run around them: deleting a session, publishing what a commit produced, answering a lookup. A port that demanded a run there would have to be handed a fabricated one.

## Ports take the context first

```ts
class S3ArtifactStorage extends ArtifactStorage {
	public async put(context: SessionContext, content: ArtifactContent): Promise<ArtifactReference> {
		const tenant = context.metadata.find(TENANT) ?? "shared";
		// ...
	}
}
```

`ArtifactStorage` (`put`, `read`, `find`, `deleteAll`) and `SessionStorage` (`create`, `find`, `append`, `readEvents`, `delete`, `saveSnapshot`, `findSnapshot`, `saveCheckpoint`, `findCheckpoint`) take a `SessionContext`; it names the session, so no method is passed an id alongside one. `SessionStorage.findOrFail` is no longer abstract: the error every implementer wrote is the same error.

`CompactionStrategy.compact`, `ContextSummarizer.summarize`, `AttachmentResolver.resolve`, `StructuredOutputValidator.validate` and `ToolCallObserver.requested`/`settled` take a `RunContext`. `SessionEventConsumer.consume` takes a `SessionContext`, because publication happens after the commit from a publisher that outlives every run.

`PricingSource.priceOf` is now `findPrice(context, model)`, and its context, like `PricingNoticeSink.report`'s, may be absent: an embedding asked for outside a run has a model and a usage but no conversation. `ConsumerNoticeSink.report` is the same for a consumer that fails while being flushed at shutdown. `LlmModel.generate`/`stream` are unchanged, because a provider is given a `ModelRequest` and never a conversation.

`ToolContext` now carries the session's `metadata` and answers `toSessionContext()`, so a tool reads what every other component reads.

## Nothing keeps it

A service receives the context as a parameter and forgets it when the method returns. Two runs share one service instance, so a field would be one run reading what another is doing, and a spec walks `runtime/` to keep that true. A tool that writes session metadata is visible to the later calls of its own run, because the fold moves on the commit that carried the write and the scope answered by that commit is the one the rest of the run reads.
