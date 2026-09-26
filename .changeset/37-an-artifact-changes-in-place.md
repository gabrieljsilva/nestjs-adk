---
"@nestjs-adk/core": major
"@nestjs-adk/testing": major
---

An artifact changes in place, and the reference you read is the lock on it.

`ArtifactStorage` gains `update(context, reference, content): Promise<ArtifactReference>`. It replaces what one artifact holds while keeping its id and its position in the session's list, and both halves of that matter. The id is already written into placeholders the conversation cannot take back, and re-listing an edited file first would reorder what `list_artifacts` shows every time a model fixes a typo.

The `reference` you pass is the one you read, and its digest is optimistic concurrency. The store compares it with what it holds now and throws `TamperedArtifactReferenceError` when the two disagree, so a writer working from a version somebody else has since replaced is refused instead of overwriting them. Writing is scoped like reading: a reference from another conversation answers `ArtifactNotFoundError`, and nothing is written.

Mutating content that a durable journal points at sounds unsafe, and it is not, because the journal never persists a digest. `AttachmentReferenceCodec` writes the artifact id and at most the media type, and every read path re-finds the reference through `ArtifactStorage.find` before reading it. So there is no stored digest anywhere that an edit could invalidate, and the digest check only ever compares a reference read in the same turn.

The cost is a sentence rather than a corruption, and it is worth knowing: a placeholder already written into `ToolResultProduced` still quotes the character count the artifact had then, and nothing rewrites a past event. That is why `edit_artifact` answers with the new size, so the turn that changed the file also states the number that is now true.

**Breaking:** `update` is abstract. An `ArtifactStorage` written outside this package does not compile until it implements it. That is deliberate rather than a default that throws: a default would split stores into ones that can be edited and ones that cannot, with nothing in the types saying which you have, and the application would find out when a model called `edit_artifact` in production.

`ArtifactStorageContractSuite` gains three cases for it. An update keeps the id and the place in the list; a stale reference is refused and leaves the content the accepted write put there; and one session cannot update another's even holding the right reference. `InMemoryArtifactStorage` and `SqliteArtifactStorage` answer all three in the same loop as the rest.
