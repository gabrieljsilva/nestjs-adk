---
"@nestjs-adk/core": major
---

A conversation can be opened under an id you already own, it stays with the agent it was transferred to, and a storage can be written outside this package.

## Opening a conversation yourself

Until now the runtime insisted on naming every conversation: a session was born inside an `ask` that carried no `sessionId`, and the id came back on the result. An application whose chat row is the conversation had two ways around that, and both are bookkeeping: ask a question first and write the returned id onto the chat, or keep a mapping between the two.

```ts
const chat = await this.chats.create({ userId: user.id });
await support.createSession({ sessionId: chat.id, owner: user.email });

await support.ask("where is my order?", chat.id);
```

Asking is deliberately unchanged. A question naming a conversation nobody opened is still refused with `SessionNotFoundError`, because the alternative is that a stale or mistyped id quietly becomes a second conversation instead of failing. An id that already names a conversation is refused with `SessionAlreadyExistsError` and the existing one is untouched; existence is not checked before the write, since two requests opening the same chat is the ordinary case and a read followed by a write loses that race by construction.

`createSession` writes the head and nothing else. The journal still begins with the first question, since every event carries the run that produced it and a conversation opened outside a run has none to carry. Which run records the beginning is now decided by looking at the journal rather than by remembering who wrote the head, which also fixes a case that was already broken: a first question that created a session and then failed before committing left a conversation that could never record its own beginning.

`ask`, `stream` and `explain` take a session id as plain text in their shorthand argument, not only as a parsed `SessionId`. The id an application holds is text, read off a chat row, and `ask(message, chat.id)` used to fall through to the options branch, where a string has no `sessionId`, and quietly opened a second conversation instead of continuing the one it named. Reading one back comes in the two usual shapes, both answering the head alone rather than replaying the journal: `findSessionById` and `findSessionByIdOrFail`.

## Breaking: the session decides who answers, not the handle

A transfer used to last exactly one turn. It wrote the new owner into the session and then `ask` ignored it, so the next question was answered by whichever agent handle the application happened to call:

```ts
await concierge.ask("meu controle quebrou");        // warranty answers, and owns the session
await concierge.ask("e o prazo?", { sessionId });   // before: concierge answered. Now: warranty does.
```

Which handle was called only decides anything when there is no session yet, and then it decides the root agent. Two things follow. A handover now means something after the turn it happened in, which is what the declared graph was for, since reaching a different handle was a way around it. And the owner recorded in the session no longer disagrees with the agent that just spoke, which was a real defect: a run that suspended for approval could be resumed by a different agent than the one that asked for it, because the approval path read the owner and `ask` did not.

To move a session from code, use `AgentRunCommand.transferTo`. It goes through the same gate the model's `transfer_to_agent` does, so a handover nobody declared is still refused. Ownership is derived rather than stored twice: `AgentTransferred` in the journal is the truth, `SessionState.activeAgent` is the projection, and the snapshot is a disposable cache.

A delegation also journals the model that served it. The child's model used to be resolved twice, once to run the turn and once to write it down, and a `ModelResolver` routing by load, cost or time answers two different questions when asked twice, so the journal could name a model that never served the turn.

## A storage you can write yourself

The port was public and its parts were not. Writing an adapter meant encoding a `SessionEvent` on the way in and rebuilding it on the way out, and both sides went through the codec registry, the event header and six identity types, none of them exported. The only storages that could exist were the two that ship here.

The failure was quiet, which is the part worth stating. An adapter can serialize an event by hand and read it back as something with the right fields, and both projectors decide by class: what the model reads and what the runtime knows are built by matching concrete event types. A duck typed object matches none of them, so a rehydrated conversation comes back empty and a suspended turn comes back with nothing pending. No error, a full journal in the database, and an agent answering as if the customer had just said hello.

What is published is codecs instead of parts. `StorageCodecs.standard()` answers with four, one per collection a storage keeps: `journal`, `snapshot`, `head` and `checkpoint`. Each turns a domain object into a record of plain values and back, and `decode` takes the row the driver handed back, whether its JSON column arrived parsed or as text. An adapter moves rows and decides about revisions, transactions and races, which is its job; what a row means stays in here, and so do the event classes, the headers, the projected state and the blocks of a compacted context, which are therefore still free to change.

They go in the root entry, next to the port and the two adapters that implement it, for the reason `PromptFileCache` sits next to `PromptSource`: implementing a port is something an application does. `CheckpointCodec` is new, and with it a durable storage can keep compaction checkpoints for the first time. `JournalCodec.fingerprintOf` is the definition of "the same event" an idempotent append needs, so two adapters cannot disagree about which writes are retries. The four errors the port must throw are published too, and `SqliteSessionStorage` now goes through the same four codecs, which is what keeps a row written here and a row written downstream meaning the same thing.

The two adapters that ship are for development and for tests: in memory while a process runs, SQLite for the same thing on disk. Anything carrying production traffic is somebody else's adapter, written against the database the application already runs, and `SessionStorageContractSuite` in `@nestjs-adk/testing` is how it is measured.

**Breaking:** `RuntimeServices.sessions` is now a `SessionService` carrying `create`, `inspect`, `find` and `findOrFail`, so `runtime.sessions.handle(id)` is `runtime.sessions.inspect(id)`. It reaches only code that embeds the runtime through `AdkRuntimeHost` without NestJS. Everything an application writes against an agent is additive: no existing signature changed.
