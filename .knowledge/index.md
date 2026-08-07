---
title: Knowledge base
description: Curated discoveries and concepts that guide future implementations
type: reference
tags: [meta, knowledge-base]
---

`.knowledge/` preserves discoveries and concepts that must guide future implementations. It is the project's decision memory, not a copy of the current code or a catalog of every feature.

Read this index before changing code. Open the guidelines related to the change, then use their decisions as implementation constraints.

A row marked `target` describes a decision the code has not reached yet. It is still the rule for new code, but existing code will disagree with it.

| Type | Guideline | About |
| --- | --- | --- |
| `entity` `target` | [[agent]] | Definition and minimum composition of an agent |
| `entity` `target` | [[llm-model]] | Definition, minimum contract and first-class features of an LLM model |
| `convention` | [[writing-guidelines]] | Format, frontmatter schema and linking rules every file in `.knowledge/` must follow |
| `convention` `target` | [[comments-and-jsdoc]] | When code comments are allowed and what public API documentation must explain |
| `convention` `target` | [[api-naming]] | Semantic names for internal entrypoints, methods, predicates and fallible lookups |
| `convention` `target` | [[type-safety]] | TypeScript restrictions and class-based data contracts across architectural layers |
| `convention` `target` | [[layer-boundaries]] | Responsibilities and dependency direction of the six architectural layers |
| `convention` `target` | [[testing-conventions]] | What earns a spec, what each level of test is responsible for, and where each one runs |
| `convention` `target` | [[error-taxonomy]] | Ownership, declaration and propagation of errors, and how an adapter classifies a provider failure |
| `convention` `target` | [[services-over-functions]] | Behavior lives in classes with explicit dependencies and free functions stay at unavoidable language boundaries |
| `pattern` `target` | [[module-boundaries]] | How the lib is split into internal modules, what each one exports, and why NestJS stays at the surface |
| `pattern` `target` | [[context-projection]] | How a journal becomes the context a model reads, how it is measured, and what compaction may never touch |
| `pattern` | [[tool-approval]] | How a run stops in front of a human, what it stores while it waits, and what runs when the answer arrives |
| `pattern` | [[run-orchestration]] | How a command becomes a run, which class owns which decision, and why the public surface holds none of them |
| `pattern` | [[session-snapshots]] | Why a snapshot is always disposable, when the runtime writes one, and what invalidates every snapshot at once |
| `pattern` | [[agent-transfer]] | How a session changes hands, how an edge is declared and when it is resolved, and what a handover deliberately does not change |
| `convention` | [[agent-suites]] | Where the real-provider tests live, why they run through the example application, and what a Gemini model can actually finish |
| `pattern` | [[agent-delegation]] | How one agent has another answer a single task, why neither reads the other's conversation, and where the runtime's only dependency cycle lives |
| `pattern` | [[multimodal-input]] | How an image reaches a model, why the journal never holds one, and what a tool result cannot carry |
| `pattern` | [[tool-declaration]] | What a shared tool extends, how one schema types both forms of a tool, and why the method form has its own descriptor type |
| `pitfall` | [[nest-composition-timing]] | Why the runtime is composed in a lifecycle hook and never in a provider, and what NestJS does to an instance captured too early |
| `pattern` | [[test-bed]] | How a test replaces the model of one agent, what a run is asserted on, and why the bed refuses to boot |
| `pattern` | [[tool-doubles]] | How a substituted tool keeps its declaration, what a double has to preserve, and when a listed tool fails the boot |
| `pitfall` | [[cross-provider-history]] | What breaks when a history written by one model is replayed to another, and where the adapter compensates |

| `pitfall` | [[money-precision]] | Why an amount is an integer count of pico dollars in a bigint, and where the single lossy step is allowed to be |
| `pattern` | [[run-pricing]] | Where a call is collected, when it is priced, and why nothing about a bill can fail a run |
