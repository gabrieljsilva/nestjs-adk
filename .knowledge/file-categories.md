---
title: File categories
description: Why every file name ends with the category of what it holds, and the categories this lib has
type: convention
tags: [core, architecture, naming]
---

A file is named `<name>.<category>.ts`. The category says what the file may contain and who may depend on it. Without it, the folder is the only signal, and a file moved between folders silently changes what it claims to be.

## The categories

| Suffix | What it is |
| --- | --- |
| `.contract.ts` | An abstract port the runtime depends on and something outside implements: `SessionStorage`, `PricingSource`, `ToolCallObserver` |
| `.adapter.ts` | An implementation of a port against one concrete technology: a provider, a store, a transport |
| `.codec.ts` | Conversion in both directions between a domain value and a stored record, with `from<Source>` and `to<Target>` methods, see [[storage-adapters]] |
| `.mapper.ts` | Conversion in one direction only, from a foreign shape into ours or back: a provider request, a published price table |
| `.record.ts` | The stored shape a codec writes and reads. No behavior |
| `.entity.ts` | Something with identity and behavior: a session, a run |
| `.value-object.ts` | An immutable value with no identity, refusing invalid input at construction |
| `.command.ts` | The input of one operation, named after it, carried as one value instead of a parameter list |
| `.options.ts` | Configuration the consumer supplies for a module or a component, with the defaults it falls back to |
| `.event.ts` | One fact appended to the journal |
| `.notice.ts` | One fact reported to a sink and never appended to the journal, so losing it costs an observation and not a state |
| `.error.ts` | A failure carrying a stable code, see [[error-taxonomy]] |
| `.policy.ts` | A rule the runtime consults and the consumer may replace: approvals, offload, snapshots, redaction |
| `.strategy.ts` | A replaceable algorithm with one job, such as compaction |
| `.use-case.ts` | One operation, one `execute`, see [[layered-responsibilities]] |
| `.service.ts` | The high-level API of one module, or a role collaborator it owns, see [[layered-responsibilities]] |
| `.factory.ts` | A collaborator whose only job is to build another object, so what is built stays free of how |
| `.edge.ts` | A public entry point that converts input into a command and a result into a public shape: `AgentHandle`, `AdkRuntime`, `AdkAgent` |
| `.tool.ts` | A tool a model may call |
| `.decorator.ts` | A decorator. A function, because TypeScript gives no other form |
| `.controller.ts` | A NestJS controller. The framework's own name for an edge, kept because its ecosystem reads it |
| `.module.ts` | Container wiring, the only place a provider is registered |
| `.token.ts` | A symbol or constant used as a key: an injection token, a reflection metadata key |
| `.double.ts` | A stand-in for a real collaborator in a test: a fake, a stub, a scripted or recording model, a storage that breaks on purpose, see [[tool-doubles]] |
| `.support.ts` | Support layer plumbing that is none of the above: matchers, a reusable contract suite, a test image |

## Tests

The suffix decides which vitest project collects the file, so it is load bearing, not decoration (`vitest.config.ts`).

| Suffix | Project | What it does |
| --- | --- | --- |
| `.spec.ts` | `unit` | A unit test, beside the file it covers |
| `.e2e.spec.ts` | `integration` | Boots the whole runtime and store, still offline |
| `.ai.spec.ts` | `playground:agents` | Spends money against a real provider. Never run by the default suite |
| `.fixture.ts` | none | Plumbing a spec cannot build from a factory |

A spec keeps the category of what it covers and adds its level on top: `session-storage.contract.ts` is covered by `session-storage.contract.spec.ts`. A spec that covers the tree rather than a file has no subject, and carries only its level: `package-boundaries.spec.ts`.

This lib has no `.integration-spec.ts`. The level is written before `.spec.ts`, not instead of it.

## The file name never repeats the category

The suffix is the word, so the basename drops it: `checkpoint.codec.ts`, `offload.policy.ts`, `adk.module.ts`, `read-artifact.tool.ts`. `checkpoint-codec.codec.ts` says it twice and `checkpoint.ts` says it not at all.

## When the class name repeats the category

The class name repeats the category when the category is a role the reader needs while holding another shape of the same concept, or when it says something the noun cannot. `SessionEvent` and `SessionRecord` both exist, and the suffix is what tells them apart. Keep `UseCase`, `Service`, `Codec`, `Adapter`, `Policy`, `Strategy` and `Tool` in the class name.

Where the noun already is the thing, the suffix stays on the file and out of the name. `SessionId` is a value object; `SessionIdValueObject` adds a word and no information. Keep `ValueObject`, `Entity`, `Record`, `Event` and `Error` out of class names where the noun already carries them: `ToolExecutionError` keeps `Error` because the noun does not say it, `AgentRunCancelled` does not gain one.

## Something that fits no category is a design question

When a file matches no row, do not invent a folder and do not leave the name bare. Ask what the class answers; check whether it is two things in one file; only then propose a category and add the row here in the same change. A category that exists in the tree but not in this table is worse than no category, because the table stops being the index.

## The table is the index, and a spec says so

`packages/core/src/file-categories.spec.ts` walks the `src` of every package, asserts the walk found the trees at all, and fails on any file whose name ends with no known category. Its `CATEGORIES` constant and the table above are one rule written twice, so a category added to the tree is added to both in the same change. The written exemptions are `index.ts`, ambient declarations, and specs, which declare their level in the suffix that decides which vitest project collects them.

`apps/playground` is an application, not a package of this lib, and names its files by its own conventions.
