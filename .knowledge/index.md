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
| `convention` `target` | [[testing-conventions]] | Unit test pairing and test responsibilities for every TypeScript production file |
| `convention` `target` | [[error-taxonomy]] | Ownership, declaration, naming and propagation of errors across feature modules |
| `convention` `target` | [[services-over-functions]] | Behavior lives in classes with explicit dependencies and free functions stay at unavoidable language boundaries |
| `pattern` `target` | [[module-boundaries]] | How the lib is split into internal modules, what each one exports, and why NestJS stays at the surface |
| `pattern` `target` | [[context-projection]] | How a journal becomes the context a model reads, how it is measured, and what compaction may never touch |
| `pattern` | [[tool-approval]] | How a run stops in front of a human, what it stores while it waits, and what runs when the answer arrives |
| `pattern` | [[run-orchestration]] | How a command becomes a run, which class owns which decision, and why the public surface holds none of them |
| `pattern` | [[session-snapshots]] | Why a snapshot is always disposable, when the runtime writes one, and what invalidates every snapshot at once |
| `pattern` | [[agent-transfer]] | How a session changes hands, why the edges are declared by name, and what a handover deliberately does not change |
| `convention` | [[agent-suites]] | What the real-provider tests are for, why they are tiny, and which Gemini model can actually finish a tool loop |
| `pattern` | [[agent-delegation]] | How one agent has another answer a single task, why neither reads the other's conversation, and where the runtime's only dependency cycle lives |
| `pattern` | [[multimodal-input]] | How an image reaches a model, why the journal never holds one, and what a tool result cannot carry |

