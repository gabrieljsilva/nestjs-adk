---
title: Session metadata
description: What an application may store on a conversation, why it is events rather than a column, and what a key is allowed to hold
type: pattern
tags: [core, sessions, journal, api-surface]
---

An application knows things about a conversation that the conversation never says: which customer it belongs to, which tenant, which locale, which plan. `SessionMetadata` is where those go, and everything about it follows from being durable and being a projection.

## It is events, and the state is the fold

`SessionMetadataSet(key, value)` and `SessionMetadataDeleted(key)` are ordinary journal events, folded by `StateProjector` into `SessionState.metadata`. Last write per key wins, so replaying the journal and reading a snapshot land on the same map, and nothing has to read what the session already holds before writing: a metadata write is a fact about what was asked, not a decision taken against a state that may have moved.

They ride on the commit of the turn that asked for them, which is what makes a run that failed lose the write together with the turn. A key that had to survive a failed run would be a second kind of durability nobody could reason about.

Forgetting is its own event rather than a value of `null`. An application that stores `null` deliberately means something by it, and a reader could not tell the two apart.

## The head holds nothing

There used to be a `SessionOwner` on `Session`, in a column, read by nobody. It was removed because the lib never checks who owns a session: authorizing a `sessionId` is the application's job before it calls. A field the runtime reads to no one's benefit is a field two places can disagree about, and it was the only durable application fact living outside the journal.

So `createSession({ metadata })` is the one case where a conversation gets events before anything is asked in it. There is nowhere else a durable fact could live, and a value kept in memory until the first question is lost by the process that opened the chat. They are written under the run that opened the session, which did happen, and that is why `SessionOpener` decides whether a journal has begun by looking at `state.activeAgent` rather than at the revision: only `SessionCreated` and a transfer name an active agent, so a session opened with metadata still records its beginning on the first question.

## A key is typed, a value is JSON

`MetadataKey.fromName<string>("customerId", guard)` is declared once, next to whatever owns the concept, so nothing reads a raw string and `find` answers the type the key promised. The guard is optional and it is what makes the type honest: without one the key trusts whoever wrote the value, which is fine for a key an application writes and reads itself; with one, a value that came back as something else reads as absent rather than as the wrong type, which is what a journal written by an older build can hand back.

Values are JSON and nothing else, checked where they are written rather than where they are read: a `Date`, a `Map` or an instance of an application's own class serializes into something that reads back as a different value, and by the time a codec noticed, the run would already have committed.

The limit is sixteen kibibytes serialized, per key rather than per session. Metadata rides on every commit, every snapshot and every rehydration, so a value the size of a document turns a decision input into a payload; a session with forty small keys is somebody using the feature, one key that large is somebody who wanted artifact storage.

## The redactor reads the key, not the field name

`FieldNameEventRedactor`, the `EventRedactor` that ships, masks by field name, and a metadata payload puts the name in `key` and the secret in `value`. A rule that only looked at field names would publish a credential stored under `token` while masking a field called `token`, so the redactor reads the same list against `key` whenever a payload has both.

## A delegation inherits it for free

A delegated run has its own agent, model, tools and budget, and it writes to the parent's journal on the parent's session. There is no child session to copy metadata into: the child reads the same fold, which is the read-only inheritance the design wanted, and a key the child writes lands on the one conversation there is.

Related: [[run-context]], [[session-snapshots]], [[storage-adapters]], [[context-projection]], [[agent-delegation]], [[agent-prompting]].
