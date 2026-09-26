---
"@nestjs-adk/core": minor
"@nestjs-adk/testing": minor
---

An artifact larger than the tools will load, and a page that never loads the whole thing.

`search_artifact` runs `matchAll` over the whole text, and `outline_artifact`, `query_artifact` and `slice_artifact` parse all of it. That is fine for what a conversation produces and wrong past a few tens of megabytes. `RuntimeOptions.context.maxExplorableCharacters` (twenty million by default) is the largest artifact those tools load whole; above it they answer `{ refused: true, reason }` naming the ceiling and the way out, before reading a byte.

The way out is `read_artifact` by character range, which no longer loads the artifact at all. `ArtifactStorage.readRange(context, reference, offset, length)` is a new method with a default implementation that reads and slices, so every adapter has it; `SqliteArtifactStorage` overrides it with `substr` inside the database. `ArtifactStorageContractSuite` gains "reads a range of what it holds", which holds an override to the same characters a full read gives. Reading by line still loads the whole text, because line starts are not known without it, and is under the ceiling.
