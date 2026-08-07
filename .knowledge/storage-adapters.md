---
title: Storage adapters
description: What a session storage written outside this package is given, why it is codecs and not parts, and how a fabricated event fails in silence
type: pattern
tags: [core, sessions, persistence, journal, api-surface]
---

`SessionStorage` is a port an application is expected to implement: SQLite is for one process, in memory is for tests, and anything shared between replicas is somebody else's adapter. That means the surface an implementer needs is public API, held to the same rules as the rest of it.

For a long time it was not. The port was exported and its parts were not, so the only storages that could exist were the two that ship here.

## The trap: a fabricated event fails in silence

An adapter can serialize a `SessionEvent` by hand and read it back as an object with the right fields. Nothing rejects it, and everything stops working.

Both projectors decide by concrete class:

- `ContextProjector` builds what the model reads by matching `UserMessageReceived`, `AssistantMessageProduced`, `ToolCallRequested` and `ToolResultProduced`;
- `StateProjector` builds what the runtime decides on by matching `SessionCreated`, `AgentTransferred`, `AgentRunSuspended` and the approval events.

An object that is not an instance of those classes falls through every branch without entering one. There is no error. A conversation with twenty turns rehydrates into an empty context and the agent answers as if it were the first message, on a full journal; a session suspended in front of a human comes back with nothing pending, and the approval is refused for a call that is sitting in the database.

This is the reason the surface is codecs. Anything that lets an adapter build an event by hand is a way to reach that failure.

## Codecs, not parts

`StorageCodecs.standard()` answers with one codec per collection a storage keeps: `journal`, `snapshot`, `head` and `checkpoint`.

Each one goes between a domain object and a record of plain values, which is all a column can hold anyway:

```ts
const record = codecs.journal.encode(event);   // nine plain values
const event = codecs.journal.decode(row);      // the class the projectors decide on
```

An adapter therefore never touches `EventHeader`, `EventCorrelation`, the six identity types, `SessionStatus`, `SessionState`, `ContentDigest`, `PendingTurn`, `StateValues`, `PromptMeasurement` or `ContextComposition`. They stay private and stay free to change, and the published surface went from around thirty types to four codecs, four records, four errors and the suite.

Three details are load bearing:

- **`decode` takes the row, not the record.** A driver hands JSON back parsed or as text depending on which driver it is, and both are accepted, because which one it is belongs to the adapter and not to the codec.
- **The journal record carries no session and no revision.** Which revision an event lands on is the storage's decision, inside its own transaction. An event that carried one would let two writers disagree about the order of the journal they share.
- **`JournalCodec.fingerprintOf` is the definition of "the same event".** Idempotent append has to tell a retry from an id that came back carrying different content, and object identity cannot: a retry that crossed a process boundary is a different instance of the same fact. An adapter fingerprinting its own way would disagree with the ones here about which writes are duplicates.

`SqliteSessionStorage` uses the same four codecs. That is not tidiness: it is what keeps a row written here and a row written downstream from drifting into meaning two different things, and it means every test of the SQLite adapter is also a test of the published codecs.

## Where each half is published

The codecs, the records and the errors are in the root entry of `@nestjs-adk/core`, next to the port and the two adapters that implement it. That is the same place `PromptFileCache` sits relative to `PromptSource`, and `HttpCatalogTransport` relative to `PricingSource`: implementing a port is something an application does, so the pieces it needs are ordinary public API. They also cost almost nothing to publish, because `SqliteSessionStorage` already pulls every one of them into the bundle.

`SessionStorageContractSuite` is in `@nestjs-adk/testing`. Measuring an adapter is testing, so it belongs with `AdkTestBed` and `ToolFake`, and `node:assert` has no business in the entry point every application loads: it is fifteen kilobytes of test code the core would carry for everyone.

`ContractSuite` and `ContractCase` stay in the core, because they are the shape of any port contract and `clock-contract-suite` uses them too. They are two tiny classes and neither imports `node:assert`.

## The suite holds nothing an implementer could not hold

This is a constraint, not an accident. The suite lives outside the core, so it imports `@nestjs-adk/core` like any consumer, and it builds its events, snapshots and checkpoints by decoding rows through the codecs rather than constructing domain objects:

```ts
private eventOf(eventId: string): SessionEvent {
	return this.codecs.journal.decode({ eventId, type: "session.created", schemaVersion: 1, ... });
}
```

If the published surface ever stops being sufficient, this file stops compiling. That makes it the standing proof of the section above, and it is also more durable than the alternative: a row written at schema version 1 is upcast on the way through, so the suite survives a payload change that constructing the event class would not.

The core cannot import a sibling package, which `package-boundaries.spec.ts` enforces over every file including specs. That is why the contract cases for both shipped adapters run from `@nestjs-adk/testing` rather than next to each adapter, and it is an improvement: one loop, both adapters, one contract.

The four deliberately broken adapters under `packages/testing/src/faulty/` are not exported. They are the test of the suite, not part of it.

Related: [[session-snapshots]], [[context-projection]], [[module-boundaries]], [[layer-boundaries]].
