---
"@nestjs-adk/core": major
"@nestjs-adk/openai": minor
---

An attachment the application owns is recorded as a name, and what it becomes is asked again on every projection.

Before this, an attachment was one of two things: bytes the runtime copied into its own artifact storage, or a URL frozen into the journal forever. A file living in the application's S3 fit neither. A pre-signed URL expires, and because history is rebuilt on every turn it then expires for every turn that follows; one without expiry is a capability URL recorded in an append-only journal and in whatever the provider cached. There is no correct TTL for an address inside a durable record, which is the sign the address was never the right thing to record.

`AttachmentReference.external(id, mediaType)` records identity alone, and `AskOptions.attachments` carries it into a question next to `media`. On every projection, including the first, the runtime hands each reference to the `AttachmentResolver` declared in `RuntimeOptions.attachments` and the application answers with an `AttachmentProjection`: `media(part)`, `note(text)` standing in as a line of text, or `omit()`. Resolver output is never cached and never recorded; the runtime keeps caching only what it materialized from its own storage.

Two resolvers ship. `InlineAttachmentResolver(loader)` fetches bytes server side and inlines them, so development against a localhost MinIO works exactly like production and no address ever travels. `SignedUrlAttachmentResolver(signer)` mints a fresh address per projection, which only makes sense in front of a model that fetches URLs itself: that is now a declared capability, `ModelCapability.MEDIA_URL`, and both shipped providers declare it. A model without it is given a note instead of an address it would read as text. Declaring no resolver keeps the previous behaviour, and an external reference then projects as a note naming the wiring gap. A resolver that throws becomes a note as well; one missing file does not end a conversation.

**Breaking:**

- `MediaPart.link` now refuses localhost, private IP ranges (IPv4 and IPv6, mapped forms included) and `.local`/`.internal` names with `UnreachableMediaUrlError`. The provider fetches a media URL from its own network, where that address goes nowhere, so the failure used to arrive as an opaque provider error that was already paid for. A self hosted model that can reach the address opts out with `MediaLimits.allowingPrivateHosts()`.
- `UserMessageReceived` is at schema version 4 and `ToolResultProduced` at 5, covering the external reference shape. Rows written by older builds keep decoding; rows written by this build are refused by older builds, which never knew the shape.
- `AskInput.with` takes a fifth optional parameter with the references, and `AskInput.hasAttachments` is true when either list has something in it, so an external reference requires a model that declared `MEDIA_INPUT`, the same as bytes.
