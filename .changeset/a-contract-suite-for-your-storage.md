---
"@nestjs-adk/testing": minor
---

`SessionStorageContractSuite` is published: every promise the `SessionStorage` port makes, as cases any runner drives.

It was internal to the core, so an application writing its own storage had to reimplement those tests, and they drifted from the contract as the contract grew. The drift is the dangerous part: the cases nobody rewrites are the ones about a batch written whole or not at all, a stale `expectedRevision` losing a race, and the same event id written twice being written once, and each of those breaks a session long after the test suite went green.

```ts
import { SessionStorageContractSuite } from "@nestjs-adk/testing";

const suite = new SessionStorageContractSuite();
for (const contract of suite.cases(() => new PrismaSessionStorage(prisma))) {
	it(contract.name, () => contract.run());
}
```

It lives here rather than in the core because measuring an adapter is testing, and because `node:assert` has no business in the entry point every application loads. The cases are data, so vitest, jest and `node:test` all drive them, and the suite reads `capabilities()` to only demand what the adapter claimed.

It was rewritten to hold nothing an implementer could not hold: it imports `@nestjs-adk/core` like any consumer and builds its events, snapshots and checkpoints by decoding rows through the published codecs. That is a constraint rather than a detail, since it stops compiling if the core ever stops publishing enough to write a storage with. `InMemorySessionStorage` and `SqliteSessionStorage` are now measured by it here, in one place, instead of by a copy of the same loop next to each of them.
