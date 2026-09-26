---
title: Artifacts
description: What an artifact is, the three things an attachment can point at, how one is changed in place without breaking a conversation, and what a tool answers for bytes it cannot read
type: entity
tags: [core, artifacts, attachments, context, security]
---

An artifact is content the session owns, with a name, that a model can address without reading. It is not "a result too large for a context": that is one of three ways an artifact comes to exist, and the origin decides nothing about it.

| Origin | Written by | Example |
| --- | --- | --- |
| offloaded | `ArtifactOffloader`, when a tool result crosses the threshold | a 40 000 character JSON answer |
| attached | `AttachmentStore`, when a question or a tool result carries bytes | an image the user sent |
| provided | the application, through `AskOptions.files` or `AgentHandle.attachArtifact` | a `.csv` the user uploaded, a `.md` the application generated |

All three land in `ArtifactStorage` under the session, all three are named by an `ArtifactReference`, and all three are reachable by the same tools. Which of those tools an agent has is the agent's declaration, not the artifact's: `read_artifact` is always there, and the five that explore plus the one that edits are listed on the agent that needs them. See [[artifact-exploration]] for the tools.

## An attachment points at one of three things, and only one is navigable

`AttachmentReference` has three forms. The journal keeps the reference and never the bytes; see [[multimodal-input]].

| Form | The runtime holds the bytes | Tools can read it |
| --- | --- | --- |
| `artifact(id, mediaType)` | yes | yes |
| `link(url, mediaType)` | no, the provider fetches it | no |
| `external(id, mediaType)` | no, the application resolves it per projection | no |

The `mediaType` travels on every form, since `AskAgentUseCase` has to know before the session is opened whether an attachment needs a model that sees (`ModelCapability.MEDIA_INPUT`) or one that can call a tool. An image needs the first; a text artifact needs nothing, because the model reads it through `read_artifact`.

`AttachmentProjection` answers what one reference becomes in one projection: `media` puts it in front of the model, `note` puts a line of text, `omit` leaves it out, and `artifact` writes the placeholder `ArtifactReference.toString` writes for an offloaded result, so the model reaches it with the same tools. `DefaultAttachmentResolver` projects an image as `media`, a text artifact as `artifact`, and anything else as a `note` saying what it is, so nothing disappears in silence.

## Text or bytes, decided at construction

`ArtifactContent` has no public constructor: `fromText(text, mediaType?, name?)` for text, `fromBytes(bytes, mediaType?, name?)` and `fromBase64(base64, mediaType, name?)` for bytes, and `restore` for a store. `isText` is the fact every tool asks first.

The reason is `outline_artifact` on a PNG. Before the split, an image was stored as base64 text and the outline answered `kind: "text"`, one line, starting with `iVBORw0KGgo`. A tool offered over content it cannot parse is a call spent being told nonsense. Every artifact tool answers `{ refused: true, reason }` for bytes, the same shape `RegexGuard` uses for a pattern it turns down, because asking is an ordinary mistake the model corrects.

A store keeps text as text and bytes as base64, and says which through the `encoding` it wrote. `ArtifactStorageContractSuite` demands that bytes come back as bytes.

## An artifact changes in place, and the digest is the lock

`ArtifactStorage.update(context, reference, content)` replaces what one artifact holds. It keeps the id and the position in the session's list, and both are deliberate: the id is already written into placeholders the conversation cannot take back, and re-listing an edited file first would reorder what `list_artifacts` shows every time a model fixes a typo.

`reference` is the one the caller read, and the digest on it is optimistic concurrency. A store compares it with what it holds now and raises `TamperedArtifactReferenceError` when the two disagree, so a second writer working from the version it read is refused rather than allowed to overwrite the first. Writing is scoped like reading: a reference from another session answers `ArtifactNotFoundError`, and nothing is written.

Mutating content that a durable journal points at is only safe because of what the journal does not keep. `AttachmentReferenceCodec` persists the artifact id and, at most, the media type. It never persists the digest. Every read path then re-finds the reference through `storage.find` before reading it: `ArtifactLoader.findOrFail` for every tool, and `AttachmentReader.describe` and `fetch` for every projection. So there is no stored digest anywhere that an edit could make stale, and the digest check only ever compares a reference read in this turn.

What it does cost is honest and small: a placeholder sentence already written into `ToolResultProduced` still quotes the character count the artifact had then, and nothing rewrites a past event. That is why `edit_artifact` answers with the new size, so the turn that changed the file also states the number that is now true. One thing the runtime does not invalidate is `AttachmentCache`, which holds a materialised `MediaPart` per session and artifact id. `edit_artifact` refuses bytes, and `DefaultAttachmentResolver` never projects text as media, so the shipped path cannot go stale; an `AttachmentResolver` of your own that projects a text artifact as media can, within one process.

`update` is abstract and not a default that throws. A store written outside this package either implements it or does not compile, which is the point: a default would split stores into ones that can be edited and ones that cannot, and the application would find out when a model called `edit_artifact` mid run. `ArtifactStorageContractSuite` measures it with three cases: an update keeps the id and the place in the list, a stale reference is refused and leaves the accepted write in place, and one session cannot update another's even holding the right reference.

## The type is declared, never sniffed

The runtime takes the `mediaType` the caller declared and does nothing to verify it. Reading magic bytes to decide what a file is belongs to the application, at its upload boundary, where it also decides which types it accepts at all. A library that sniffed would carry a signature table that goes stale and would answer a question the application already answered.

## A name is a value object, because the model reads it

A file name comes from the end user and ends up in the placeholder line the model reads: `[artifact a-1 "sales.csv", text/csv, 912340 characters, ...]`. A name holding `]` or a line break forges a placeholder, which is the injection [[tool-result-injection]] describes with a new door.

`ArtifactName.fromText` refuses control characters and square brackets and caps the length at `MAX_LENGTH`. The name is for the model and the person; nothing resolves by it, so two artifacts may share one.

## Writing the store over a relational database

The port promises nothing about the session existing: `put` under a session nobody created is ordinary, and `ArtifactStorageContractSuite` does exactly that. A table with a foreign key to the sessions table therefore seeds the session in the spec before the cases run, or drops the key; the first is right, because deleting a conversation has to take its artifacts with it.

Every suite instance prefixes its session ids with a random token, so two suites measuring two stores on one database in parallel never truncate each other's rows.

`readRange` on Postgres is `substr(content, $1, $2)`. `substring(content from $1 for $2)` with bound parameters is read as the regex overload and answers `null`, which arrives as an empty page and not as an error.

## Every list has a ceiling

`ArtifactStorage.list(context, limit)` answers the session's artifacts, newest first, never more than `limit`. `list_artifacts` passes its own ceiling and reports `truncated` when it hit it. A list read without a bound is an unbounded string on the way to a model.

## What stays out

Semantic search over an artifact (chunks, embeddings, a vector store) is a different product with a different dependency, and it fails in silence where `search_artifact` fails out loud. It is not planned here.

`search_artifact` loads the whole text and runs `matchAll` over it, and the outline, the pointer and the slice parse all of it. That is fine for the sizes a conversation produces and wrong past a few tens of megabytes. The ceiling is `RuntimeOptions.context.maxExplorableCharacters`, twenty million by default, and `ArtifactLoader.loadOrRefuse` refuses above it before reading a byte. `read_artifact` by character range stays available at any size, because it goes through `ArtifactStorage.readRange`, which every adapter inherits with a default that reads and slices and `SqliteArtifactStorage` answers with `substr`. Reading by line loads the whole text, since line starts are unknown without it, and is under the ceiling.
