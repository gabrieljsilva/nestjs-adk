---
title: File categories
description: Why every file name ends with the category of what it holds, and the categories this lib has
type: convention
status: target
tags: [core, architecture, naming]
---

A file is named `<name>.<category>.ts`. The category says what the file may contain and who may depend on it. Without it, the folder is the only signal, and a file moved between folders silently changes what it claims to be.

## The categories

| Suffix | What it is |
| --- | --- |
| `.contract.ts` | An abstract port the runtime depends on and something outside implements: `SessionStorage`, `PricingSource`, `ToolCallObserver` |
| `.adapter.ts` | An implementation of a port against one concrete technology: a provider, a store, a transport |
| `.codec.ts` | Conversion in both directions between a domain value and a stored record, with `from<Source>` and `to<Target>` methods, see [[storage-adapters]] |
| `.record.ts` | The stored shape a codec writes and reads. No behavior |
| `.entity.ts` | Something with identity and behavior: a session, a run |
| `.value-object.ts` | An immutable value with no identity, refusing invalid input at construction |
| `.event.ts` | One fact appended to the journal |
| `.error.ts` | A failure carrying a stable code, see [[error-taxonomy]] |
| `.policy.ts` | A rule the runtime consults and the consumer may replace: approvals, offload, snapshots, redaction |
| `.strategy.ts` | A replaceable algorithm with one job, such as compaction |
| `.use-case.ts` | One operation, one `execute`, see [[layered-responsibilities]] |
| `.service.ts` | The high-level API of one module |
| `.tool.ts` | A tool a model may call |
| `.decorator.ts` | A decorator. A function, because TypeScript gives no other form |
| `.module.ts` | Container wiring, the only place a provider is registered |

## Tests

The suffix decides which vitest project collects the file, so it is load bearing, not decoration (`vitest.config.ts`).

| Suffix | Project | What it does |
| --- | --- | --- |
| `.spec.ts` | `unit` | A unit test, beside the file it covers |
| `.e2e.spec.ts` | `integration` | Boots the whole runtime and store, still offline |
| `.ai.spec.ts` | `playground:agents` | Spends money against a real provider. Never run by the default suite |
| `.fixture.ts` | none | Plumbing a spec cannot build from a factory |

This lib has no `.integration-spec.ts`. The level is written before `.spec.ts`, not instead of it.

## When the class name repeats the category

The class name repeats the category when the category is a role the reader needs while holding another shape of the same concept, or when it says something the noun cannot. `SessionEvent` and `SessionRecord` both exist, and the suffix is what tells them apart. Keep `UseCase`, `Service`, `Codec`, `Adapter`, `Policy`, `Strategy` and `Tool` in the class name.

Where the noun already is the thing, the suffix stays on the file and out of the name. `SessionId` is a value object; `SessionIdValueObject` adds a word and no information. Keep `ValueObject`, `Entity`, `Record`, `Event` and `Error` out of class names where the noun already carries them: `ToolExecutionError` keeps `Error` because the noun does not say it, `AgentRunCancelled` does not gain one.

## Something that fits no category is a design question

When a file matches no row, do not invent a folder and do not leave the name bare. Ask what the class answers; check whether it is two things in one file; only then propose a category and add the row here in the same change. A category that exists in the tree but not in this table is worse than no category, because the table stops being the index.

## What is still missing

Only `.error.ts` (105 files), `.codec.ts` (20), `.fixture.ts` (8), `.decorator.ts` (6) and `.module.ts` are in use today. Everything else carries a bare name.

A spec walks `packages/*/src`, the way `packages/core/src/package-boundaries.spec.ts` already walks it, and fails when a file declares no known category, with `index.ts` and ambient declarations as the written exemptions. It also asserts that the walk found the tree at all, so a broken path never reads as a clean sweep. That spec is written in the phase that applies the suffixes, not before: until it exists, the sweep is manual and the table decays without anyone seeing it.
