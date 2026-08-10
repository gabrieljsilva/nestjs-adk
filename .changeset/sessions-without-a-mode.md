---
"@nestjs-adk/core": major
---

A conversation no longer declares how long it means to last.

`SessionMode` is gone, and with it `Session.mode`, the `mode` column on the head, and `MissingSessionOwnerError`. The distinction never bought anything: nothing in the runtime branched on it, and an ephemeral session was journaled, snapshotted and rehydrated exactly like a durable one. The only behaviour attached to the word was the invariant that refused a durable session without an owner, so the mode granted nothing and rejected something.

That invariant said a durable session has to belong to someone "or it can never be found again", which was true while the runtime named every session. It stopped being true with `createSession({ sessionId: chat.id })`: an application that chose the identifier already knows how to find the conversation. So `owner` is now plainly optional everywhere, with no combination of arguments that refuses for its absence.

This also answers what `createSession` should do about the mode, which is nothing. There is no option to add and no default to argue about.

**Breaking:**

- `SessionMode` is no longer exported.
- `Session.start` and `Session.restore` no longer take a mode.
- `SessionHeadRecord` no longer carries `mode`, and the head codec neither writes nor reads it. A row that still has the column is read fine; the column is ignored and can be dropped.
- `AgentRunCommand` no longer takes `mode`, so every parameter after it moved up one position.
- `StorageCapabilities.supportsDurableSessions` is now `supportsConcurrentWriters`, and the two factories that build one are `concurrent(...)` and `singleWriter()` rather than `durable(...)` and `ephemeral()`. All three always described the adapter rather than any session, and now the names say so.
- `SqliteSessionStorage` creates its `sessions` table without the `mode` column. An existing database file keeps a `NOT NULL` column nothing fills, so it stops accepting new sessions: delete the file and let it be recreated. The adapter is for development and tests, which the README and the guidelines now say plainly rather than implying it is fit for a single production process.
