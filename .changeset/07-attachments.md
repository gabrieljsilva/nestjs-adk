---
"@nestjs-adk/core": major
"@nestjs-adk/openai": minor
---

An attachment the application owns is recorded as a name, and what it becomes is asked again on every projection.

A question carries an image the way a tool answer does: `media` takes the bytes, or a public address the provider fetches itself, and the journal keeps a name rather than a payload. A `MediaPart` is written to artifact storage and the event holds the id, because a journal is read on every rehydration, every status check and every projection, while the image itself is only looked at when a prompt is being built.

That shape assumes the runtime either holds the bytes or freezes an address, and a file living in the application's own bucket fits neither. A pre-signed URL expires, and because history is rebuilt on every turn it then expires for every turn that follows; one without expiry is a capability URL recorded in an append-only journal and in whatever the provider cached. There is no correct TTL for an address inside a durable record, which is the sign the address was never the right thing to record.

`AttachmentReference.external(id, mediaType)` records identity alone, and `AskOptions.attachments` carries it into a question next to `media`:

```ts
await agent.ask("what does the receipt say?", {
	attachments: [AttachmentReference.external(upload.id, "image/png")],
});
```

On every projection, including the first, the runtime hands each reference to the `AttachmentResolver` declared in `RuntimeOptions.attachments` and the application answers with an `AttachmentProjection`: `media(part)` puts it in front of the model, `note(text)` puts a line of text where it stood so a message that says "describe this image" still reads coherently, and `omit()` leaves it out. Resolver output is never cached and never recorded; the runtime keeps caching only what it materialized from its own storage. The one exception is a compaction checkpoint, which persists already projected blocks.

Two resolvers ship. `InlineAttachmentResolver(loader)` fetches bytes server side and inlines them, so development against a localhost MinIO works exactly like production and no address ever travels. `SignedUrlAttachmentResolver(signer)` mints a fresh address per projection, which only makes sense in front of a model that fetches URLs itself: that is now a declared capability, `ModelCapability.MEDIA_URL`, and both shipped providers declare it. A model without it is given a note instead of an address it would read as text.

Declaring no resolver keeps the previous behaviour, and an external reference then projects as a note naming the wiring gap. A resolver that throws becomes a note as well, because one missing file should not end a conversation that was already answered once.

**Breaking:**

- `MediaPart.link` refuses localhost, private IP ranges (IPv4 and IPv6, mapped forms included) and `.local`/`.internal` names with `UnreachableMediaUrlError`. The provider fetches a media URL from its own network, where that address goes nowhere, so the failure used to arrive as an opaque provider error that was already paid for. A self hosted model that can reach the address opts out with `MediaLimits.allowingPrivateHosts()`.
- `UserMessageReceived` is at schema version 4 and `ToolResultProduced` at 5, covering the external reference shape. Rows written by older builds keep decoding; rows written by this build are refused by older builds, which never knew the shape.
- `AskInput.with` takes a fifth optional parameter with the references, and `AskInput.hasAttachments` is true when either list has something in it, so an external reference requires a model that declared `MEDIA_INPUT`, the same as bytes.
