---
title: Run context
description: The one object every component reads a run from, what dies with the invocation, and why no service may keep it
type: pattern
tags: [core, runs, sessions, api-surface, architecture]
---

`RunContext` is what a run is. Everything the runtime consults about where it is takes one as its first parameter, and nothing holds one in a field. It is modelled on Google ADK's `InvocationContext`, and it replaced a habit of passing a `SessionId` into one port, an `AgentRunId` into the next and nothing at all into the third.

## Two halves, told apart by how long they are true

The durable half is the conversation: `sessionId`, the session's `metadata`, the `revision` its journal has reached, and the `activeAgent` answering in this run. Every one of those is a fold of the journal or the head, so the context is rebuilt from the session on every open rather than remembered between them. That is what makes it safe to hand an adapter: what it reads is what a replay would read.

The invocation half is this question and nothing else: `runId`, `startedAt`, `actor`, `signal`, `depth`, and `parent` for a delegation. It dies when the run settles. A process that restarts holds the journal and not this.

`RunContext extends SessionContext`, and that is the whole of the second class: `sessionId`, `metadata`, `revision`. It exists because some things happen to a conversation with no run around them, and a port that demanded a run there would have to be handed a fabricated one.

## SessionContext is what a port gets when there is no run

The decision was between a minimal `RunContext` with invented parts and a smaller base class, and the base class won because it keeps the contracts honest. An adapter deleting a session, a consumer told about events after the commit, and a storage answering a lookup are all outside any run: there is no agent answering, no stop button and no actor. `SessionContext` says exactly that, and because `RunContext` extends it, a port declaring the smaller one accepts both.

So `ArtifactStorage` and `SessionStorage` take `SessionContext`, and every port that only exists inside a turn — `CompactionStrategy`, `ContextSummarizer`, `AttachmentResolver`, `StructuredOutputValidator`, `ToolCallObserver` — takes `RunContext`. `SessionEventConsumer` takes `SessionContext` on purpose: publication happens after the commit, from a publisher that outlives every run and batches across sessions.

Three ports accept an absent context, each for one named caller and no other:

- `PricingSource.findPrice` and `PricingNoticeSink.report`, because an embedding asked for outside a run has a model and a usage but no conversation;
- `StructuredOutputValidator.validate`, for a model call made outside a run, such as a judge grading an answer in a test;
- `ConsumerNoticeSink.report`, for a consumer that fails while being flushed at shutdown, holding a batch that never said which sessions it came from.

Inventing a context for those would be worse than admitting there is none.

## The context is the first parameter, and it names the session

`SessionStorage.find(context)` rather than `find(context, sessionId)`: two ways of saying which conversation is meant is one too many. What the context adds over the id is metadata, which is how an adapter routes a write, prefixes a bucket or picks a shard without the runtime having to know it shards:

```ts
class S3ArtifactStorage extends ArtifactStorage {
	public async put(context: SessionContext, content: ArtifactContent): Promise<ArtifactReference> {
		const tenant = context.metadata.find(TENANT) ?? "shared";
		// ...
	}
}
```

On a read that has not happened yet the metadata is empty, because it is the fold of the journal about to be read. There is no way around that and nothing pretends otherwise: a write always carries what the run already folded, a first read carries only the id.

## Built once, extended, never rebuilt

`RunContext.fromOpenedSession(session, state, run, { signal, actor })` runs once, at the start of the use case, from the opened session plus what the command carried. Everything after it is a derivation:

- `withActiveAgent` for a handover, which moves who answers and nothing else;
- `delegatedTo(run, signal)` for a child, which keeps the conversation and points `parent` at the run that asked;
- `withMetadata` when a set lands on this run's commit.

That last one is the reason `TurnLoop.commit` answers with a scope instead of returning nothing. A tool that writes session metadata writes it onto the turn's commit, so the fold moves while the run is still going, and the later calls of the same run have to read what the earlier ones wrote. Without it a tool would be the one component blind to its own write.

`RunScope` holds a context rather than repeating it: the model, the catalog, the skills, the limits and the breaker are what the runtime *resolved*, and `sessionId`, `actor`, `signal` and `run` are getters onto the context. `ToolContext` is the same context narrowed to one call, built by `RunContext.toToolContext(callId)`, and it carries the metadata so a tool reads what every other component reads.

## A service never keeps one in a field

Two runs share one service instance. A context in a field is one run reading what another run is doing, and it is the rule that keeps the lib stateless, the same reason as the no-global-state rule in [[module-boundaries]]. `run-context-statelessness.spec.ts` walks `runtime/` and fails on any field typed `RunContext` or `SessionContext`.

Four classes are exempt, and they are exempt because they *are* one invocation rather than a collaborator that serves many: `RunScope`, `ToolExecutionCommand`, `PrepareContextCommand` and `ModelRunCommand`. Each is created inside the run it describes and dropped when the run ends.

Related: [[layered-responsibilities]], [[session-metadata]], [[run-orchestration]], [[storage-adapters]], [[agent-delegation]], [[tool-approval]].
