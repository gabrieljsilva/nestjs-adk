---
"@nestjs-adk/core": major
"@nestjs-adk/testing": major
---

Artifacts a model can ask questions of: paged reads, an outline, a search and a pointer, a SQLite store for the bytes, and a boot notice when they would not survive a restart.

## A placeholder used to be a dead end

A tool answered with forty thousand characters, the runtime moved it out of the context, and the only way back was `read_artifact`, which handed the whole thing back. The model either paid for the result it had just been spared, or worked from a placeholder. Both are bad answers to "what is the total on order 42".

`read_artifact` now pages:

```jsonc
// read_artifact({ artifactId: "a-1", offset: 0, limit: 2000 })
{ "artifactId": "a-1", "offset": 0, "text": "…", "totalCharacters": 40000, "hasMore": true, "nextOffset": 2000 }
```

The page nobody asks for is the offload threshold itself, which is exactly the largest answer the runtime was willing to leave in a context. A page past the end is empty rather than an error, because "where does it end" is a question the model asks by reading, and one that has to guess an offset to avoid a failure will guess.

**Breaking:** `read_artifact` answered a bare string and now answers that object.

## Three more tools, and a policy that decides which apply

`outline_artifact(artifactId, depth?)` says what is in there: for JSON the keys, the types and the length of every array down to `depth` (2 by default); for text the lines, characters, bytes and how it starts. `search_artifact(artifactId, query, regex?, maxMatches?, context?)` says where something is, with the line and the characters around each hit. `query_artifact(artifactId, pointer)` reads one value out by RFC 6901 JSON Pointer.

All three are internal like `read_artifact`, so no approval policy applies to them, and all three resolve an id inside the session that asked.

Which of them a placeholder offers is a decision rather than a fact about the bytes. `OffloadPolicy` gains `decide(characters, mediaType)`, answering `OffloadDecision.INLINE`, `OPAQUE` or `EXPLORABLE`, and the placeholder says so:

```text
[artifact a-1, application/json, 40000 characters, read with read_artifact(artifactId, offset, limit), or explore with outline_artifact, search_artifact and query_artifact]
```

`CharacterCountOffloadPolicy` calls JSON and `text/*` explorable and everything else opaque, because offering tools over content they cannot parse is a call spent being told no.

**Breaking:** `OffloadPolicy.shouldOffload` was abstract and is now a concrete method read off `decide`, which is the one abstract member. A policy of your own implements `decide`.

## Every answer is budgeted, and nothing is evaluated

Each answer is fitted to the offload threshold before it is returned, which is what stops the recursion: without it, a tool written to help a model read something too large to read would produce something too large to read, be offloaded, and hand back a placeholder describing a placeholder. Fitting is by dropping and it is always declared as `truncated: true`, because a model told it saw everything and did not will act on the half it was shown.

`query_artifact` takes a pointer and only a pointer. JSONPath filters are an expression language, and an expression language whose source is a string the model wrote is code execution with extra steps. `search_artifact` is a literal string unless `regex: true`, and then the pattern goes through a guard that refuses a quantifier on a group that itself repeats or branches, a backreference, lookaround, a repetition over 100, and anything over 200 characters. A refused pattern comes back as `{ refused: true, reason }` the model can correct, never as a failed run.

## SqliteArtifactStorage, and a notice when there is none

```ts
const connection = new SqliteConnection("store.db");

AdkModule.forRoot(
	AdkModuleOptions.from({
		defaultModel,
		storage: new SqliteSessionStorage(connection),
		artifacts: new SqliteArtifactStorage(connection),
	}),
);
```

The two belong together. A journal is durable and an in memory artifact store is not, so a conversation restored after a restart names artifacts nothing can resolve, and the model reads a sentence about content it has no way to reach. Two processes have the same problem without waiting for a restart.

So a runtime composed to offload into `InMemoryArtifactStorage` now reports `ArtifactsNotDurable` through `ContextNoticeSink` at boot, from both `AdkModule` and `createAdkRuntime`. It is a notice and not a refusal, because one process is a correct way to run a script, a test or a container, and there is no logger behind it: declare the sink and you hear it, declare nothing and the library stays quiet.

**Breaking:** `ContextNoticeSink` now receives `ContextNotice`, which is `ContextWindowUnknown | ArtifactsNotDurable`. A sink that read fields off `ContextWindowUnknown` narrows with `instanceof`; one that reads `message` is unchanged.

## ArtifactStorageContractSuite

`@nestjs-adk/testing` gains the suite, beside the session one and driven the same way:

```ts
const suite = new ArtifactStorageContractSuite();
for (const contract of suite.cases(() => new S3ArtifactStorage(client))) {
	it(contract.name, () => contract.run());
}
```

It demands the two guarantees the port is written about: what comes out of `read` is what went into `put`, verified against the digest, and a session only ever reads its own, with anything else absent rather than refused. Both shipped stores answer the same cases, in one loop.
