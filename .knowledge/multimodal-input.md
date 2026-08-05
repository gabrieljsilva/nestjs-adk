---
title: Multimodal input
description: How an image reaches a model, why the journal never holds one, and what a tool result cannot carry
type: pattern
tags: [core, models, artifacts, context]
sources:
  - https://adk.dev/artifacts/
  - https://github.com/cline/cline/blob/main/sdk/packages/llms/src/providers/middleware/split-tool-images.ts
  - https://github.com/cline/cline/blob/main/sdk/packages/shared/src/llms/media.ts
---

A user can attach an image to a question and a tool can answer with one. Both end up as a `MediaPart`, and everything else about them is different: where the bytes live, what the journal records, and where in the request they are allowed to sit.

## The journal records names, never bytes

A `MediaPart` is validated at the boundary and written to `ArtifactStorage` by `AttachmentStore`. What the event keeps is the `ArtifactId`: `UserMessageReceived` in `v: 2` and `ToolResultProduced` in `v: 3` both carry a list of ids, absent when there is none.

The reason is read frequency. A journal is read on every rehydration, every status check and every projection, while the image itself is only looked at when a prompt is being built. Inlining a megabyte of base64 into an event makes every one of those reads carry it.

`AttachmentReader` brings it back during projection, with a cache bounded by bytes rather than entries, because without one the image attached to the first question would be fetched again on every turn after it for the life of the conversation.

## Failing to store is not the same failure twice

A user's attachment that cannot be written ends the command with `AttachmentNotStoredError`. There is no inline fallback: the journal holds ids, so accepting the message would record a question about an image nobody can look at.

A tool's image that cannot be written is dropped and the call still succeeds. The effect already happened, and marking the call failed is how a refund gets issued twice. The data is the answer; the image was the illustration.

`ArtifactOffloader` is the third case and behaves like neither: a result too large to sit in a context falls back to sitting in the context, because the text still fits somewhere.

## An image is counted by what it costs, not by how long it is

`MediaPart.characters` returns `ProjectedMediaCost`, which is a declared floor of 258 tokens per image, and never `base64.length`. `ContextMeasurer` works in characters, so counting the encoding would make a one megabyte image read as a million characters, dominate the composition and make compaction drop conversation to make room for something the provider bills as a few hundred tokens.

The payload size is still available as `encodedBytes`, which is what limits are enforced against. The two numbers exist because they answer different questions: what the request weighs, and what the context is spending.

## Validation happens where the image arrives

`MediaPart.image` refuses an unsupported type, base64 an encoder would not have written, and a data URL whose type disagrees with the declared one. `MediaLimits` holds three ceilings, and the third one only exists where the whole list does: a set of images that each fit can still overflow one request, so `AskInput.with` applies the total.

All of it fails before the call, because every one of these reaches the provider as a rejected request that was already paid for.

## A model that cannot see is two different situations

An attachment handed to an agent whose model does not declare `MEDIA_INPUT` fails in `AskAgent` before the session is even opened. That is configuration: the application pointed an agent at a model that cannot see and then handed it an image.

An image already in the journal, reread by a model that cannot see it, is a routing decision: a failover, a transfer, a delegation to a specialist. `MediaFit` replaces the part with a line saying an image was there and the run continues. Nothing about the session is rewritten, so a later turn on a model that can see gets the image back.

`ModelExecutor.verify` therefore checks tools and structured output, and deliberately does not check media.

## A tool result carries no image on the wire

`role: "tool"` is a string in Chat Completions and Gemini's function response is a JSON value. An image left inside one arrives as a very long base64 string, which the model reads as text and then describes wrongly and confidently.

`MediaSplitter` runs in `ContextProjection.toRequest`: the result keeps its data, and the image follows immediately as a `UserMessage` naming the tool that produced it. Every provider maps that to its own multimodal shape without help.

It lives in the domain rather than in the executor so that diagnostics, `ExplainAgent` and the provider all see the same list of messages. The projection itself is untouched: what a block holds is a fact of the session, and what a request holds is a fact about one wire format.
