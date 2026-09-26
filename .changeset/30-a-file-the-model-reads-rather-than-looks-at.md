---
"@nestjs-adk/core": major
---

A file the model reads rather than looks at: `.md`, `.csv`, JSON and any text arrive as an artifact, and the artifact tools are how the model gets at them.

## Two doors in

```ts
await agent.ask("summarize the report", {
	files: [ArtifactContent.fromText(markdown, "text/markdown", ArtifactName.fromText("q3.md"))],
});

const reference = await agent.attachArtifact(sessionId, ArtifactContent.fromText(csv, "text/csv", name));
await agent.ask("what is the total in column b?", { sessionId, attachments: [reference] });
```

`AskOptions.files` stores each file under the session and journals the reference with the question, the way `media` already did for an image. `attachArtifact` stores one outside a question, for an application that uploads first and asks later; it refuses a session nobody opened with `SessionNotFoundError`. Both are `AskInput.files` and `SessionService.attachArtifact` underneath.

## The fourth projection

`AttachmentProjection.artifact()` joins `media`, `note` and `omit`. It asks the runtime to write the placeholder an offloaded result gets, with the name, the type, the size and the tools that apply under the offload policy, so a `.csv` is read with `read_artifact`, `outline_artifact`, `search_artifact` and `query_artifact` instead of being pasted into the prompt. `DefaultAttachmentResolver`, `InlineAttachmentResolver` and `SignedUrlAttachmentResolver` all answer it for a stored artifact that is text.

Before it existed a text attachment failed `MediaPart.image` inside `load`, the failure was swallowed, and the projection was `omit`: the file vanished with no line saying so.

## The type travels with the reference

`AttachmentReference.artifact(id, mediaType)` carries the media type like `link` and `external` always did, and `isImage`, `isReadableArtifact` and `needsMediaInput` read it. `ModelService` now refuses a model without `MEDIA_INPUT` only for an image: a text artifact handed to an agent on a text-only model runs, because the model reads it through a tool. A reference written before the type travelled is treated as an image, which is what every stored attachment was.

**Breaking:**

- `AttachmentResolver.resolve` takes a `RunContext`, as the changeset that introduced `RunContext` said it did. An implementation that declared `SessionContext` keeps compiling.
- `UserMessageReceived` and `ToolResultProduced` are at schema version 6, carrying `mediaType` beside a stored attachment's `id`. Rows written by older builds keep decoding; rows written by this build are refused by older builds.
- `AttachmentStore.store` takes a fourth list, the files, and `AttachmentStore.attach` is new; `SessionService` takes an `AttachArtifactUseCase`. Both reach only code that composes the runtime by hand.
