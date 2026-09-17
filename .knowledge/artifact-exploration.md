---
title: Artifact exploration
description: How a result too large for a context becomes something a model can still ask questions of, what each answer is allowed to cost, and what a store that dies with the process takes with it
type: pattern
tags: [core, artifacts, tools, context, security]
sources:
  - https://datatracker.ietf.org/doc/html/rfc6901
  - https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS
---

A tool answered with forty thousand characters and the runtime moved it out of the context. Before this, the only way back was `read_artifact`, which handed the whole thing back: the model either paid for the result it had just been spared or worked from a placeholder. Both are bad answers to "what is the total on order 42".

## The policy decides how, not only whether

`OffloadPolicy.decide(characters, mediaType)` answers an `OffloadDecision`, and the three values are ordered by what the model can still do:

- `inline`: nothing left the context, and there is no artifact;
- `opaque`: it left, and the way back is reading it;
- `explorable`: it left, and its shape is one the runtime's own tools understand.

`shouldOffload` is read off `decide` rather than declared beside it, because two methods answering one question is two answers that can disagree. `CharacterCountOffloadPolicy` answers `explorable` for `application/json`, anything ending in `+json` and every `text/*` over its threshold, and `opaque` for everything else. A policy that wants another rule writes one; that is the only thing `RuntimeOptions.context.offload` has ever been for.

The decision travels exactly as far as the sentence it writes. `ArtifactReference.toString(decision)` is what the model reads in place of the content, and it names the tools that apply:

```text
[artifact a-1, application/json, 40000 characters, read with read_artifact(artifactId, offset, limit), or explore with outline_artifact, search_artifact and query_artifact]
```

Nothing durable holds the decision. What is durable is the reference, and re-deciding later, under a policy that has since changed, would change what a conversation already said about content nobody moved.

## Four tools, and what each one is for

All four are `internal`, so no approval policy applies to them ([[tool-approval]]), and all four resolve an id inside the session that asked, so knowing an id is not enough to read one.

| Tool | Arguments | Answers |
| --- | --- | --- |
| `read_artifact` | `artifactId`, `offset?`, `limit?` | a page of characters, the total length, and whether more remains |
| `outline_artifact` | `artifactId`, `depth?` | for JSON, keys, types and array lengths to `depth` (2 by default); for text, lines, characters, bytes and the first lines |
| `search_artifact` | `artifactId`, `query`, `regex?`, `maxMatches?`, `context?` | where a string appears, with the line and the characters around each hit |
| `query_artifact` | `artifactId`, `pointer` | the value at an RFC 6901 JSON Pointer, or an outline of it when it is too large |

Reading is paged because the whole point of moving a result out was that it did not fit, and a tool that answers with all of it undoes the offload in one call. The default page is the offload threshold itself: exactly the largest answer the runtime was willing to leave in a context. A page past the end is an empty page rather than an error, because "where does it end" is a question the model asks by reading, and a model that has to guess an offset to avoid a failure will guess.

`outline_artifact` is the first call of the three and the reason the other two are usable. A placeholder gives an id, a media type and a length, which is not enough to write a pointer or guess a search term.

## Every answer is budgeted, and that is what stops the recursion

`ArtifactBudget` is the offload threshold, and every answer these tools produce is fitted to it before it is returned. Without that, a tool written to help a model read something too large to read would produce something too large to read, be offloaded by the same policy, and hand back a placeholder describing a placeholder.

Fitting is by dropping and never by summarizing: a search that found four hundred matches answers with the first few and sets `truncated: true`, because a model told it saw everything and did not will act on the half it was shown. The frame of an answer is measured first and the content gets the remainder, so what survives is always the part the model needs to ask again.

An outline is the one answer that shrinks another way: it is rebuilt at a shallower depth until it fits, so a deeply nested document gives back its top rather than nothing.

## No evaluation, anywhere

`query_artifact` takes a JSON Pointer and nothing else. JSONPath has filters, unions and, in most implementations, an expression evaluator, and an expression evaluator reached by a string a model wrote is code execution with extra steps. A pointer is a list of names and indices: it cannot branch, match or compute, so the worst a hostile one does is miss.

`search_artifact` is a fixed string by default, and that is the safety story rather than a convenience: the common case has no engine behind it at all. `regex: true` goes through `RegexGuard` first, which is a class of its own with a spec listing what it accepts and what it turns down:

- at most 200 characters;
- no quantifier on a group that itself repeats or branches, which is every exponential family: `(a+)+`, `(a*)*`, `(a?)+`, `([a-z]+)*`, `(a|a)+`;
- no backreference;
- no lookahead or lookbehind;
- no repetition bound over 100;
- it has to compile.

Flags are never the model's to choose: what the guard builds is global and nothing else. A refused pattern comes back as `{ refused: true, reason }` rather than as a failed run, because writing a pattern the guard turns down is an ordinary mistake the model can correct. The guard is conservative on purpose: it refuses shapes known to backtrack instead of deciding whether a particular one does, and the cost of that is a sentence back to the model. Nothing about a timeout would help, since the loop runs inside one call and there is no thread to interrupt it from.

A pointer into an artifact that does not parse as JSON raises `ArtifactNotExplorableError`, which names what the artifact actually is and which tool to call instead. Parsing decides that, not the media type: the offloader defaults everything that declared nothing to `text/plain`, so a JSON document stored as text still is one and a log file labelled JSON still is not.

## Everything a tool returns is still untrusted

An outline names types and counts, but a search excerpt and a queried value are content somebody else wrote, and they reach the model unmarked like every other tool result. See [[tool-result-injection]]. Exploration narrows what reaches the context; it does not sanitize it.

## An in memory artifact store loses conversations, not just artifacts

The journal is durable, so a placeholder written into a conversation outlives the process that wrote it. If the artifact behind it does not, the conversation comes back naming content nothing can resolve, and every one of the four tools answers `ArtifactNotFoundError` for an id the model can see in front of it. The model is then looking at a sentence describing content it has no way to reach, which is worse than the result it replaced.

So `AdkRuntime.start` reports `ArtifactsNotDurable` through `ContextNoticeSink` when the offload policy can offload and the artifact store is `InMemoryArtifactStorage`. It is a notice and not a refusal: a first script, a test and a single container are all correct under it. It goes through the sink that already carries facts about what a model reads, and there is no logger behind it, because a library that writes to stdout on behalf of an application is a library that cannot be quiet. An application that declared no sink hears nothing, which is the trade every other notice makes.

The fix is one line, and it is either `SqliteArtifactStorage` pointed at the same `SqliteConnection` the sessions use, an `ArtifactStorage` of your own, or `CharacterCountOffloadPolicy.disabled()`, which keeps large results in the prompt and pays for them there.

## The store is measured by a contract, like the session one

`ArtifactStorageContractSuite` is in `@nestjs-adk/testing` beside `SessionStorageContractSuite`, for the same reason: measuring an adapter is testing, and `node:assert` has no business in the entry point every application loads. Both shipped stores answer it in one loop, so `InMemoryArtifactStorage` and `SqliteArtifactStorage` are held to one contract rather than two similar ones.

It demands the two guarantees the port is written about: what comes out of `read` is what went into `put`, verified against the digest, and a session only ever reads its own, with anything else absent rather than refused, because an id is guessable and a refusal confirms it exists. There is no capability declaration, unlike the session suite: every artifact store promises the same two things, and how long it keeps them is visible to nobody holding the port. Like the session suite, it holds nothing an implementer could not hold. See [[storage-adapters]].

Related: [[multimodal-input]], [[context-projection]], [[tool-approval]], [[run-context]], [[error-taxonomy]].
