---
"@nestjs-adk/core": minor
---

`SessionStorage` becomes implementable from outside the package.

The port was public and its parts were not. Writing an adapter meant encoding a `SessionEvent` on the way in and rebuilding it on the way out, and both sides went through the codec registry, the event header and six identity types, none of them exported. `Session.restore` asked for a `SessionStatus`, a snapshot asked for a `SessionState` and a `ContentDigest`, and a checkpoint had no codec at all: the in memory adapter keeps the live object and the SQLite one refuses checkpoints. The only storages that could exist were the two that ship here.

The failure was quiet, which is the part worth stating. An adapter can serialize an event by hand and read it back as something with the right fields, and the two projectors decide by class: what the model reads and what the runtime knows are both built by matching concrete event types. A duck typed object matches none of them, so a rehydrated conversation comes back empty and a suspended turn comes back with nothing pending. No error, a full journal in the database, and an agent answering as if the customer had just said hello.

What is published is codecs instead of parts. `StorageCodecs.standard()` answers with four, one per collection a storage keeps: `journal`, `snapshot`, `head` and `checkpoint`. Each turns a domain object into a record of plain values and back, and `decode` takes the row the driver handed back, whether its JSON column arrived parsed or as text. An adapter moves rows and decides about revisions, transactions and races, which is its job; what a row means stays in here, and so do the event classes, the headers, the projected state and the blocks of a compacted context, which are therefore still free to change.

They go in the root entry, next to the port and the two adapters that implement it, for the reason `PromptFileCache` sits next to `PromptSource` and `HttpCatalogTransport` next to `PricingSource`: implementing a port is something an application does. They also cost nothing to publish, since `SqliteSessionStorage` already put them in the bundle.

`CheckpointCodec` is new, and with it a durable storage can keep compaction checkpoints for the first time. `JournalCodec.fingerprintOf` is the definition of "the same event" an idempotent append needs, so two adapters cannot disagree about which writes are retries. The four errors the port must throw are published too.

`SessionStorageContractSuite` moves to `@nestjs-adk/testing`, where the test bed already lives, because measuring an adapter is testing and `node:assert` has no business in the entry point every application loads. It was rewritten to hold nothing an implementer could not hold: it builds its events, snapshots and checkpoints through the codecs, out of rows, which is both the proof that the published surface is sufficient and the reason a storage downstream is measured by exactly the cases the two here answer. Both of those now run against it in one place instead of a copy of the loop next to each adapter.

`SqliteSessionStorage` now goes through the same four codecs, which is what keeps a row written here and a row written downstream meaning the same thing.
