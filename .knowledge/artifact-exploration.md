---
title: Artifact exploration
description: The tools a model reads and edits an artifact with, which of them an agent has to ask for, what each answer is allowed to cost, and what a store that dies with the process takes with it
type: pattern
tags: [core, artifacts, tools, context, security]
sources:
  - https://datatracker.ietf.org/doc/html/rfc6901
  - https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS
---

An artifact is content the session owns and a model addresses without reading; what one is, and the three ways one comes to exist, is [[artifacts]]. This file is about the tools. They were written for a tool result that had left the context, and they apply unchanged to a file the application attached, because both are an `ArtifactReference` in the same store.

## The policy decides how, not only whether

`OffloadPolicy.decide(characters, mediaType)` answers an `OffloadDecision`, and the three values are ordered by what the model can still do:

- `inline`: nothing left the context, and there is no artifact;
- `opaque`: it left, and the way back is reading it;
- `explorable`: it left, and its shape is one the runtime's own tools understand.

`shouldOffload` is read off `decide` rather than declared beside it, because two methods answering one question is two answers that can disagree. `CharacterCountOffloadPolicy` answers `explorable` for `application/json`, anything ending in `+json` and every `text/*` over its threshold, and `opaque` for everything else. A policy that wants another rule writes one; that is the only thing `RuntimeOptions.context.offload` has ever been for.

The decision travels exactly as far as the sentence it writes. `ArtifactReference.toString(decision)` is what the model reads in place of the content:

```text
[artifact a-1 "sales.csv", text/csv, 13480 characters, read with read_artifact(artifactId, offset, limit), and its shape is one the artifact exploration tools understand]
```

**The sentence names no tool but `read_artifact`.** It is durable: it is written into `ToolResultProduced` and read back on every later turn, so it cannot know which agent will read it, and the exploration tools are listed per agent. Naming `outline_artifact` to an agent that was never given it is an instruction the model cannot follow, and the model then spends a call finding that out. `read_artifact` is named because every agent that has tools at all has it. `list_artifacts` answers on the same rule: each entry carries an `explorable` boolean, where it used to carry the names of the tools that applied.

Nothing durable holds the decision itself either. What is durable is the reference, and re-deciding later, under a policy that has since changed, would change what a conversation already said about content nobody moved.

## Seven tools, and what each one is for

None of them is exempt from anything. The access policy is asked about `read_artifact` exactly as it is asked about an application's tool, the approval policy is asked about `edit_artifact` the same way, and what one answers is offloaded by the rule every other result goes through; see [[tool-approval]]. All seven resolve an id inside the session that asked, so knowing an id is not enough to read one, and every one that opens an artifact asks `isText` first and answers `{ refused: true, reason }` for bytes.

`read_artifact` is the one every agent with tools gets; the six below are opt in, and the section after the table is why.

| Tool | Arguments | Answers |
| --- | --- | --- |
| `list_artifacts` | none | every artifact of the session, newest first: id, name, type, size, and whether it is explorable |
| `read_artifact` | `artifactId`, then `offset?`/`limit?` in characters or `fromLine?`/`lines?` in lines | a page, the total, and whether more remains |
| `outline_artifact` | `artifactId`, `depth?` | for JSON, keys, types and array lengths to `depth`; for CSV, the header, the row count and a sample per column; for Markdown, the headings with their line; for text, lines, characters and the first lines |
| `search_artifact` | `artifactId`, `query`, `regex?`, `caseSensitive?`, `mode?`, `maxMatches?`, `context?` | where a string appears: `excerpts` with the characters around each hit, `lines` with the whole line, or `count` alone |
| `query_artifact` | `artifactId`, `pointer` | the value at an RFC 6901 JSON Pointer, or an outline of it when it is too large |
| `slice_artifact` | `artifactId`, `fromRow?`, `toRow?`, `columns?` | a rectangle of a CSV, by row range and column name |
| `edit_artifact` | `artifactId`, `edits` | the new size, and per block where it landed and how much it removed and added |

Reading is paged because the whole point of moving a result out was that it did not fit, and a tool that answers with all of it undoes the offload in one call. The default page is the offload threshold itself: exactly the largest answer the runtime was willing to leave in a context. A page past the end is an empty page rather than an error, because "where does it end" is a question the model asks by reading, and a model that has to guess an offset to avoid a failure will guess.

Reading by line exists because `search_artifact` answers with a line number. Before `fromLine`, the model was handed a line it could only use by guessing a character offset, and the cycle search then read was broken at the join.

`outline_artifact` is the first call and the reason the others are usable. A placeholder gives an id, a name, a media type and a length, which is not enough to write a pointer or guess a search term. Which outline it builds is decided by parsing, in the order JSON, CSV, Markdown, text, and never by the media type: the offloader defaults everything that declared nothing to `text/plain`, and a file the application named `report.md` is Markdown whatever its declared type says.

`search_artifact` is case sensitive by default and `caseSensitive: false` is the one flag the model may ask for. `RegexGuard` still builds the expression, so the model never chooses flags. `totalMatches` counts every occurrence up to `MAX_COUNTED_MATCHES` and says so when it stopped counting; before, it silently stopped at the number of matches it returned, and an artifact with more than a hundred hits reported exactly a hundred.

## Editing is exact, single match and all or nothing

`edit_artifact` changes a text artifact in place, keeping its id and its position in the session list; the store side of that is in [[artifacts]]. It takes `edits`, one string holding one or more git conflict style blocks, the format Aider and Cline use:

```text
<<<<<<< SEARCH
the exact text to find
=======
the text to put there
>>>>>>> REPLACE
```

**Matching is exact and never fuzzy**, indentation and line endings included. Fuzzy matching is how an edit tool corrupts content in silence: it finds something near enough, writes there, and the model is told the edit applied. A refusal costs one call and the model can act on it, so every ambiguity is refused with a reason naming the block and saying what to do about it. A SEARCH section that matches nothing is told that matching is exact and that it should read the part it is changing; one that matches more than once is told to extend it with the lines around it until it is unique; an empty one is told the artifact already exists and there is nothing to insert against; and a malformed block is named by the line it broke on and shown the shape it should have had.

Occurrences are counted **overlapping**: the next search starts one character past the last hit, not past the whole match. Two overlapping positions are two places a person could have meant, so counting them as one would pick a side. Counting stops at a hundred and the reason then says "at least 100 times".

Nothing is written unless every block applies. The blocks run in order against a copy in memory, each one against the result of the one before it, and `ArtifactStorage.update` is called once after the last one lands. A half applied edit is a file in a state nobody wrote.

`edit_artifact` declares `ToolEffect.WRITE`, and that now means something, because no tool is exempt from the approval policy any more: an application whose policy holds writes holds this one, and the change waits for a person like any other write. It is deliberately **not** in `ArtifactExplorationTools`. A group named for exploration that quietly carries a write is how an agent ends up able to change a file nobody meant to give it; an agent that should edit lists `EditArtifactTool` and says so. The answer carries the new character count, because a placeholder already written into the journal still quotes the old one.

## Six of them are opt in, and a declaration is prompt

`RuntimeTools` holds two lists: what the runtime brings to every agent that has tools at all, and what it brings only to an agent that asked. `read_artifact` is in the first, because a placeholder naming an artifact no tool can open is worse than no attachment at all. The other six are in the second, and an agent asks by listing the class:

```ts
@Agent({ name: "analyst", description: "...", tools: [LookupOrderTool, ...ArtifactExplorationTools] })
@Agent({ name: "editor", description: "...", tools: [OutlineArtifactTool, EditArtifactTool] })
```

`ArtifactExplorationTools` is the five that read, and nothing else. The class is not the tool. `SearchArtifactTool.request()` answers a `RuntimeToolRequest`: a `ToolDefinition` carrying the name, the description and the schema, with a handler that refuses. `RunScopeFactory` swaps each request for the bound tool when it builds the catalog, so the declaration is written once beside the code and the application never holds the store, the policy or the budget. A request that reaches a model is a runtime that does not own that tool, and it raises `UnboundRuntimeToolError` rather than answering something wrong. `RuntimeTools.bind` reads the names off the declared `RuntimeToolRequest` instances only, so an application tool that happens to be called `search_artifact` is never the thing the bind swaps. It does not survive either: `AgentCatalogBuilder` refuses that agent at boot with `DuplicateRuntimeToolNameError`, naming the tool, the agent and the provider that declared it. Every name the runtime binds is reserved, and the set is read off the classes that declare those names in `packages/core/src/runtime/tool/runtime-tool-names.value-object.ts`. The runtime appends its own tools after the agent's, so a shared name used to mean the application's tool was dropped and nothing anywhere said so. Refusing the boot costs one rename, once, at the place the mistake was made; replacing a tool in silence costs a model calling something nobody wrote.

`SharedToolLookup` recognises a class by asking it for a `request()` and checking the answer is a `RuntimeToolRequest`, which is why the type exists rather than a marker property: a class with a method of that name that answers something else is still unregistered. Outside a container there is no lookup, and `AgentDefinitionInput.tools` takes `SearchArtifactTool.request()` directly.

They are opt in because **a tool declaration is prompt paid on every turn of every run**. `ContextMeasurer` counts a tool's name, its description and its serialised schema in the prefix, and the seven measure, in characters:

| Tool | Characters |
| --- | --- |
| `read_artifact` | 1 251 |
| `list_artifacts` | 403 |
| `outline_artifact` | 777 |
| `search_artifact` | 1 548 |
| `query_artifact` | 615 |
| `slice_artifact` | 930 |
| `edit_artifact` | 1 101 |

All seven on every agent is 6 625 characters, 5 374 of which an agent that never sees an artifact would be paying for. The prefix is also what compaction scales against, so adding to the always-on list changes when every conversation compacts, in the direction nobody expects: see the ratio in [[context-projection]].

## Every answer is budgeted, and that is the whole recursion guard

`ArtifactBudget` is `max(threshold, 1000)`, and 20 000 when the policy declares no threshold, or one of zero, so a disabled policy still gives the tools a number to fit to. The floor exists because a paid run against a threshold of 300 answered a search with `matches: []`: one excerpt with its frame did not fit, and the only match was dropped.

The budget used to be half the story, because the runtime's own tools were exempt from offload. They are not any more, so the budget is now the only thing standing between a tool written to help a model read something too large to read and an answer too large to read, offloaded by the same policy into a placeholder describing a placeholder. The arithmetic that makes it hold is worth writing down: offload triggers **strictly above** the threshold (`characters <= threshold` is inline), and the budget **equals** the threshold whenever the threshold is at least a thousand. So an answer fitted to the budget is at most the threshold, and at most the threshold stays inline.

`ArtifactBudget.fit` measures the frame with the content field emptied and `truncated: true` added, gives the remainder to the content, and drops list entries, or the whole value, until the serialised answer is inside the budget. Fitting is by dropping and never by summarizing: a search that found four hundred matches answers with the first few and sets `truncated: true`, because a model told it saw everything and did not will act on the half it was shown. An outline is the one answer that shrinks another way: it is rebuilt at a shallower depth until it fits, so a deeply nested document gives back its top rather than nothing.

`read_artifact` does not fit, it repaginates. `ArtifactPage.toResult` was never measured, so a full page was `threshold` characters of text **plus** the JSON frame, and without the old exemption every complete read would have offloaded itself. The handler now measures the result and, when it is over, rebuilds the page with the overflow taken off the room, and does that again in a loop until the answer sits inside the budget. It gives up only when a rebuild stops making the text smaller, which is what hands control to the degrade path below; every other pass strictly shrinks the text, so the loop always ends.

A single retry was never enough, and not only for the reason it looked like. Cutting N raw characters does not reliably remove N characters of JSON: when the first build already reached the end of the artifact, `hasMore` is false and the frame carries no `nextOffset` at all, so the retry that cuts the text also **adds** `"nextOffset":N` to the frame, and that addition can cost more than the cut saved. An artifact of 897 characters read against a threshold of 1000 measures 1016 both before and after a single retry: the cut shrank the content but grew the envelope around it, and the total did not move. This is worth keeping as a trap because it looks obviously correct and is not: shrinking the content is not the same as shrinking the answer, since the content is not the only thing that changes size. The loop above is what actually converges these cases to the budget, by re-measuring after every cut instead of trusting one.

Reading by line has no floor to fall through any more. `ArtifactPage.fromLines` still takes the first requested line whole, whatever room it was given, and that is deliberate, not the bug it looks like: a page must never be half a line while its `fromLine` and `lines` fields claim it is a whole one. When the fitted by-line answer is still over budget, the handler degrades to `ArtifactPage.fromLineStart(content, fromLine, limit)`, a page addressed by character at the offset where that line starts. It carries no `fromLine`, `lineCount` or `totalLines`, so `toResult` reports only `offset`, `text`, `totalCharacters`, `hasMore` and `nextOffset`: an object built this way has no line fields left to lie with. The model asked by line, gets back a character addressed page starting exactly where that line starts, and continues reading the rest with `offset` and `limit` with nothing skipped. Reading by character range is no longer a separate way around this; it is what the tool falls back to by itself.

Below a threshold of a thousand the floor stops being free. The budget is then larger than the threshold, so an answer fitted to the budget can still cross it and be offloaded. That is bounded rather than broken: an offloaded answer holds at most the budget, reading it back gives at most a page of the threshold plus a frame, so the chain stops growing after one step, and `RunLimits.maxIterations` ends the run in any case. It is still a threshold nobody should choose. Under a thousand characters the tools spend calls describing their own answers.

## No evaluation, anywhere

`query_artifact` takes a JSON Pointer and nothing else. JSONPath has filters, unions and, in most implementations, an expression evaluator, and an expression evaluator reached by a string a model wrote is code execution with extra steps. A pointer is a list of names and indices: it cannot branch, match or compute, so the worst a hostile one does is miss.

`search_artifact` is a fixed string by default, and that is the safety story rather than a convenience: the common case has no engine behind it at all. `regex: true` goes through `RegexGuard` first, which is a class of its own with a spec listing what it accepts and what it turns down:

- at most 200 characters;
- no quantifier on a group that itself repeats or branches, which is every exponential family: `(a+)+`, `(a*)*`, `(a?)+`, `([a-z]+)*`, `(a|a)+`;
- no backreference;
- no lookahead or lookbehind;
- no repetition bound over 100;
- it has to compile.

Flags are never the model's to choose: what the guard builds is global, and case insensitive only when the tool passed `caseSensitive: false` through. A refused pattern comes back as `{ refused: true, reason }` rather than as a failed run, because writing a pattern the guard turns down is an ordinary mistake the model can correct. The guard is conservative on purpose: it refuses shapes known to backtrack instead of deciding whether a particular one does, and the cost of that is a sentence back to the model. Nothing about a timeout would help, since the loop runs inside one call and there is no thread to interrupt it from.

`slice_artifact` is the same idea for a table: a row range and a list of column names, with no filter and no expression. `edit_artifact` is the same idea for a write: literal text in, literal text out, and no pattern anywhere.

A pointer into an artifact that does not parse as JSON raises `ArtifactNotExplorableError`, which names what the artifact actually is and which tool to call instead. Parsing decides that, not the media type: the offloader defaults everything that declared nothing to `text/plain`, so a JSON document stored as text still is one and a log file labelled JSON still is not.

## Everything a tool returns is still untrusted

An outline names types and counts, but a search excerpt and a queried value are content somebody else wrote, and they reach the model unmarked like every other tool result. See [[tool-result-injection]]. Exploration narrows what reaches the context; it does not sanitize it. `edit_artifact` turns that around: what it writes is text the model produced, and the next read of that artifact hands it back to a model as content, so an artifact an agent may edit is no longer content the application wrote.

## An in memory artifact store loses conversations, not just artifacts

The journal is durable, so a placeholder written into a conversation outlives the process that wrote it. If the artifact behind it does not, the conversation comes back naming content nothing can resolve, and every one of the tools answers `ArtifactNotFoundError` for an id the model can see in front of it. The model is then looking at a sentence describing content it has no way to reach, which is worse than the result it replaced.

So `AdkRuntime.start` reports `ArtifactsNotDurable` through `ContextNoticeSink` when the offload policy can offload and the artifact store is `InMemoryArtifactStorage`. It is a notice and not a refusal: a first script, a test and a single container are all correct under it. It goes through the sink that already carries facts about what a model reads, and there is no logger behind it, because a library that writes to stdout on behalf of an application is a library that cannot be quiet. An application that declared no sink hears nothing, which is the trade every other notice makes.

The fix is one line, and it is either `SqliteArtifactStorage` pointed at the same `SqliteConnection` the sessions use, an `ArtifactStorage` of your own, or `CharacterCountOffloadPolicy.disabled()`, which keeps large results in the prompt and pays for them there.

## The store is measured by a contract, like the session one

`ArtifactStorageContractSuite` is in `@nestjs-adk/testing` beside `SessionStorageContractSuite`, for the same reason: measuring an adapter is testing, and `node:assert` has no business in the entry point every application loads. Both shipped stores answer it in one loop, so `InMemoryArtifactStorage` and `SqliteArtifactStorage` are held to one contract rather than two similar ones.

It demands the guarantees the port is written about: what comes out of `read` is what went into `put`, verified against the digest; a session only ever reads its own, with anything else absent rather than refused, because an id is guessable and a refusal confirms it exists; and `update` replaces content without moving the artifact, refuses a stale reference, and is scoped like a read. There is no capability declaration, unlike the session suite: every artifact store promises the same things, and how long it keeps them is visible to nobody holding the port. Like the session suite, it holds nothing an implementer could not hold. See [[storage-adapters]].

Related: [[artifacts]], [[multimodal-input]], [[context-projection]], [[tool-approval]], [[run-context]], [[error-taxonomy]].
