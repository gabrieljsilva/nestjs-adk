---
title: Agent prompting
description: Where an agent's prompt is built, why once per agent per run, and what a variable in it costs
type: pattern
tags: [core, prompt, runtime, cost]
---

An agent declares its prompt one of two ways, and never both. `@Agent({ prompt })` is a fixed string. Overriding `prompt(context)` on `AdkAgent` builds one from data, with everything the class has injected.

Declaring both fails at boot with `AmbiguousAgentPromptError`. There is no precedence rule on purpose: whichever way it were resolved, the other declaration would read exactly like a configured prompt while the model never received it.

## Once per agent per run

The prompt is resolved in `RunScopeFactory`, which is why `create`, `switched` and `delegated` all answer a promise, and why `AgentSwitch.to` does too. A scope is born exactly three times in a run's life, and each one is a different agent taking over, so resolving it there means once per agent per run. `TurnLoop.prepare` reads `scope.instructions` and never `definition.instructions`.

This is a cost decision before it is a design one. The system prompt is the head of the prefix a provider caches, so anything that changes there invalidates every cached token after it. Measured on this repository's own paid suite: 3031 of 3751 prompt tokens came back cached, worth 68% of that run's input bill. A prompt rebuilt between turns would also be a database call per turn.

The rule to give a developer: keep the variable part small and stable within a session. A customer name is fine. A timestamp is not, because it changes the prefix on every run for no benefit. `apps/playground/src/loyalty/club.e2e.spec.ts` asserts this with `toHaveStablePrefix`, so the claim is measured rather than repeated.

## Why a method and not a shareable class

The previous version had `AdkPrompt`, a provider an agent referenced with `@Agent({ prompt: MyPrompt })`. It was removed and is not coming back: there is no case for two agents wanting exactly the same prompt, and the case that looks like it is a skill. A prompt is what one agent is, and skills are what any agent can know.

## Where the runtime meets the instance

`AgentDefinition` is domain and cannot call a method on something NestJS built, so it carries a `PromptBuilder` port, exactly as it carries a `ToolHandler` for each tool. `MethodPromptBuilder` closes over the instance and invokes the method through `Reflect.apply`, so `this` still reaches what was injected.

Deciding which instances get one belongs to the public layer, in `AgentPromptScan`, because it means comparing against `AdkAgent.prototype.prompt`, and `adapters/nest` is not allowed to know the base class an application extends. See [[layer-boundaries]]. The comparison is a function identity check rather than a prototype walk, so a subclass three levels down counts and no decorator has to be declared to opt in.

## render, renderFromFile, renderFromFileOrFail

`this.prompting` answers three things, split by what they know:

- `render(template, vars)` interpolates text the agent already has. No I/O, no source, no `OrFail` pair, because it has no absence to report. An application whose prompts live in a database reads the row and calls this.
- `renderFromFile(path, vars)` asks the `PromptSource` and answers `undefined` when it has nothing.
- `renderFromFileOrFail(path, vars)` is the same and throws `PromptNotFoundError` naming the path the source resolved. Reach for this one by default: an agent answering without the instruction it was written around is worse than one that fails saying which file is missing.

`PromptSource.load` returning `undefined` is a normal answer, the same rule `PricingSource.priceOf` follows. `describe(name)` exists so the error can say where the source looked, since a relative path resolving somewhere unexpected is the usual cause.

## What a custom source owns

An agent passes a name and never a location, so replacing the source changes nothing above it: the same `renderFromFileOrFail("support.md")` reads a bucket, a table or a disk. Three responsibilities go with it, and a remote source that skips any of them is broken in a way the type system will not say.

**Caching is the source's, not the runtime's.** `PromptFileCache` lives inside `FileSystemPromptSource` rather than in `AgentPrompting`, and that placement is a decision: a source that already serves from memory should not be cached twice, and one that must not cache (a prompt an operator edits live) must be able to say so. The consequence is that a source reading the network per run puts a round trip in front of every conversation, which is why the cache is exported rather than internal.

**A throwing `load` ends the run.** Nothing catches it, unlike a pricing source, where a failure is survivable because a bill is never worth a conversation. A prompt is the opposite: an agent answering without the instruction it was written around is the worse outcome. A source that prefers a stale copy to a failure decides that inside `load`.

**The source is a value the application constructs**, not a provider token, like `storage`, `pricing` and `embedder`. So it cannot be injected, and anything it depends on is built by hand at bootstrap. `Embedder` is the exception in the module and is reachable by injection, which makes this asymmetric; worth revisiting if an application needs a source with dependencies of its own.

`promptSource` and `prompts.dir` together are refused, because `prompts.dir` configures the source the other one replaces.

## Required and optional variables

`{{name}}` is optional and renders as nothing when nothing filled it. `{{{name}}}` is required and throws `MissingPromptVariablesError`, naming every missing key at once so one run is enough to fix them all.

Both are matched by one regular expression with the required form first, and the order inside that alternation is load bearing. Matching `{{name}}` against `{{{name}}}` consumes the inner braces and renders `{Ana}`, reporting nothing missing: a required variable silently degraded into an optional one wrapped in punctuation. This was measured against the v1 regex before the new syntax was chosen.

`null` counts as absent for both, because the value usually comes from a lookup and a column nobody filled is saying the same thing as a key nobody passed. An empty string counts as filled.

## Data in the prompt rather than in the message

The reason this exists at all. Without it, an application that wants an agent to know who it is talking to concatenates the name into the user's message, which puts data in the one place a model has been told to treat as somebody else's words. Building the prompt from an injected repository keeps it in the system prompt, where it is instruction.

The key for that lookup is `PromptContext.owner`, which is the session's owner and not an argument of the current call: a conversation continued tomorrow builds for the same person it was opened for. `AskOptions.owner` is how an application sets it when the session starts.

## Path resolution

`FileSystemPromptSource` resolves an absolute path as it is, a `./` or `../` path from the working directory, and anything else under the prompts directory (`./prompts` by default).

The middle rule is worth stating out loud because it is not what a developer assumes. A relative path in a source file usually means "next to this file" and here it does not. The v1 source guessed that location by parsing a stack trace and filtering frames by filename, which broke under bundlers and made the answer depend on which frame happened to be on top. An agent that wants a prompt next to itself builds the absolute path from its own location, which is what `apps/playground/src/loyalty/loyalty.module.ts` does with `import.meta.url`.

Absence is never cached and neither is a failure, so a file added after the first miss is found and a permission fixed after a failure stops failing. What is cached is the read itself rather than its result, so ten runs starting at once share one open.

That cache is a file cache and has nothing to do with the provider's prompt cache. [[context-projection]] holds the rules about the prefix a provider caches, and this file's own rule about a variable part is the same rule applied to the head of it.
