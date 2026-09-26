---
title: Multimodal input
description: How an image reaches a model, why the journal never holds one, and what a tool result cannot carry
type: pattern
tags: [core, models, artifacts, context]
sources:
  - https://adk.dev/artifacts/
  - https://github.com/cline/cline/blob/main/sdk/packages/llms/src/providers/middleware/split-tool-images.ts
  - https://github.com/cline/cline/blob/main/sdk/packages/shared/src/llms/media.ts
  - https://blog.google/innovation-and-ai/technology/developers-tools/gemini-api-new-file-limits/
  - https://github.com/googleapis/js-genai/issues/1385
---

A user can attach an image to a question and a tool can answer with one. Both end up as a `MediaPart`, and everything else about them is different: where the bytes live, what the journal records, and where in the request they are allowed to sit.

## The journal records names, never bytes

A `MediaPart` is validated at the boundary and written to `ArtifactStorage` by `AttachmentStore`. What the event keeps is the `AttachmentReference`: an `ArtifactId` for bytes the runtime stored, an address for a link, an `externalId` for a file the application owns. `UserMessageReceived` carries the list since `v: 2`, external references since `v: 4`; `ToolResultProduced` since `v: 3`, external references since `v: 5`. Absent when there is none.

The reason is read frequency. A journal is read on every rehydration, every status check and every projection, while the image itself is only looked at when a prompt is being built. Inlining a megabyte of base64 into an event makes every one of those reads carry it.

`AttachmentReader` brings it back during projection, with a cache bounded by bytes rather than entries, because without one the image attached to the first question would be fetched again on every turn after it for the life of the conversation.

The cache is keyed by session and id, and a delete is the one thing that can make it lie: the bytes are gone but the key still answers. So `SessionService.delete` is what the runtime deletes a conversation through, and it removes the journal, the artifacts and the reader's entries in that order. An application calling `SessionStorage.delete` directly is deleting behind the cache, and `AttachmentReader.forget(context)` is public for exactly that caller.

## Materialization is asked, not recorded

Identity is durable and materialization is not: a signed URL is right for one turn and wrong for the next, and relevance ("not this turn", "not any more") is policy the runtime does not own. So every reference passes through the `AttachmentResolver` port on every projection, and the answer is an `AttachmentProjection`: `media` puts it in front of the model, `note` puts a bracketed line of text where it stood, `omit` leaves it out, and `artifact` writes the placeholder an offloaded result gets, so a `.md` or a `.csv` is read through the artifact tools instead of pasted into the prompt; see [[artifacts]]. `DefaultAttachmentResolver` projects an image as `media`, a text artifact as `artifact`, bytes nothing can read as a `note` naming the type, and an external reference as a note saying no resolver is configured, because that is a wiring mistake somebody has to see. Before the fourth answer existed, a text attachment failed `MediaPart.image` inside `load`, the failure was swallowed, and the projection was `omit`: the file vanished with no line saying so.

Three rules keep this honest. Resolver output is never cached and never recorded; the reader's cache holds only what `AttachmentRequest.load` materialized from the runtime's own storage. A resolver that throws becomes a note, never a dead turn, for the same reason an unreadable artifact is left out. And the request tells the resolver what the wire accepts (`acceptsRemoteUrl`, from `ModelCapability.MEDIA_URL`), so a signed address is never minted for a model that would read it as text. Both shipped providers declare the capability: OpenAI fetches through `image_url`, and Gemini fetches public HTTPS and signed URLs (S3 pre-signed, Azure SAS) through `fileUri` since January 2026, when the premise that `fileUri` only took its own Files API expired. One reliability note travels with Gemini: `googleapis/js-genai#1385` reports intermittent "Cannot fetch content from the provided URL" for S3 pre-signed URIs where the URL stays valid and a retry succeeds, which is a reason to expect retries in the application, not a reason to declare the capability false.

The shipped resolvers are the two ends of that decision: `InlineAttachmentResolver` fetches server side and inlines (development, private files, no address ever travels), `SignedUrlAttachmentResolver` mints a fresh address per projection (production S3, TTL of minutes, nothing durable holds it). One caveat travels with the second: a compaction checkpoint persists projected blocks, so a checkpointed turn keeps the address it was projected with.

`MediaPart.link` refuses a loopback or private range address with `UnreachableMediaUrlError` unless `MediaLimits.allowingPrivateHosts()` says the serving model can reach it, because the provider fetches from its own network and the failure there is silent.

## Failing to store is not the same failure twice

A user's attachment that cannot be written ends the command with `AttachmentNotStoredError`. There is no inline fallback: the journal holds ids, so accepting the message would record a question about an image nobody can look at.

A tool's image that cannot be written is dropped and the call still succeeds. The effect already happened, and marking the call failed is how a refund gets issued twice. The data is the answer; the image was the illustration.

`ArtifactOffloader` is the third case and behaves like neither: a result too large to sit in a context falls back to sitting in the context, because the text still fits somewhere.

## An image is counted by what it costs, not by how long it is

`MediaPart.characters` returns `ProjectedMediaCost`, which is a declared floor of 258 tokens per image, and never `base64.length`. `ContextMeasurer` works in characters, so counting the encoding would make a one megabyte image read as a million characters, dominate the measurement and make compaction drop conversation to make room for something the provider bills as a few hundred tokens.

The payload size is still available as `encodedBytes`, which is what limits are enforced against. The two numbers exist because they answer different questions: what the request weighs, and what the context is spending.

## Validation happens where the image arrives

`MediaPart.image` refuses an unsupported type, base64 an encoder would not have written, and a data URL whose type disagrees with the declared one. `MediaLimits` holds three ceilings, and the third one only exists where the whole list does: a set of images that each fit can still overflow one request, so the `AskInput` constructor applies the total.

All of it fails before the call, because every one of these reaches the provider as a rejected request that was already paid for.

## A model that cannot see is two different situations

An image handed to an agent whose model does not declare `MEDIA_INPUT` fails in `AskAgentUseCase` before the session is even opened. That is configuration: the application pointed an agent at a model that cannot see and then handed it an image. A text artifact is not an image and does not trigger it, because the model reads it through a tool; `AttachmentReference` carries the media type on every form so the check can tell the two apart without opening the store.

An image already in the journal, reread by a model that cannot see it, is a routing decision: a failover, a transfer, a delegation to a specialist. `MediaFit` replaces the part with a line saying an image was there and the run continues. Nothing about the session is rewritten, so a later turn on a model that can see gets the image back.

`ModelExecutor.verify` therefore checks tools and structured output, and deliberately does not check media.

## A tool result carries no image on the wire

`role: "tool"` is a string in Chat Completions and Gemini's function response is a JSON value. An image left inside one arrives as a very long base64 string, which the model reads as text and then describes wrongly and confidently.

`MediaSplitter` runs in `ContextProjection.toRequest`: the result keeps its data, and the image follows immediately as a `UserMessage` naming the tool that produced it. Every provider maps that to its own multimodal shape without help.

It lives in the domain rather than in the executor so that diagnostics, `ExplainAgentUseCase` and the provider all see the same list of messages. The projection itself is untouched: what a block holds is a fact of the session, and what a request holds is a fact about one wire format.
