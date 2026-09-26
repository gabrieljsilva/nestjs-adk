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
| `convention` | [[comments-and-jsdoc]] | A comment is forbidden: the two exceptions, and the sweep that keeps them near zero |
| `convention` | [[api-naming]] | Verb-first method names, factories that name their source, and the failure semantics a name has to carry |
| `convention` `target` | [[type-safety]] | TypeScript restrictions and class-based data contracts across architectural layers |
| `convention` `target` | [[layer-boundaries]] | Which folder a symbol lives in, and the dependency direction between the six folders |
| `convention` `target` | [[layered-responsibilities]] | What an edge, a use case, a service and a repository may each contain, and why dirty code moves inward |
| `convention` | [[file-categories]] | Why every file name ends with the category of what it holds, and the categories this lib has |
| `convention` | [[component-heuristics]] | The four numbers that open a design question about a class, and why line count is not one of them |
| `convention` `target` | [[testing-conventions]] | What earns a spec, what each level of test is responsible for, and where each one runs |
| `convention` `target` | [[error-taxonomy]] | Ownership, declaration and propagation of errors, and how an adapter classifies a provider failure |
| `convention` `target` | [[services-over-functions]] | Behavior lives in classes with explicit dependencies and free functions stay at unavoidable language boundaries |
| `pattern` `target` | [[module-boundaries]] | How the lib is split into internal modules, what each one exports, and why NestJS stays at the surface |
| `pattern` `target` | [[context-projection]] | How a journal becomes the context a model reads, how it is measured, when it is compacted by default, and what compaction may never touch |
| `pattern` | [[tool-approval]] | How a run stops in front of a human, what it stores while it waits, and what runs when the answer arrives |
| `pattern` | [[run-context]] | The one object every component reads a run from, what dies with the invocation, and why no service may keep it |
| `pattern` | [[run-orchestration]] | How a command becomes a run, which class owns which decision, and why the public surface holds none of them |
| `pattern` | [[session-metadata]] | What an application may store on a conversation, why it is events rather than a column, and what a key is allowed to hold |
| `pattern` | [[session-snapshots]] | Why a snapshot is always disposable, when the runtime writes one, and what invalidates every snapshot at once |
| `pattern` | [[agent-transfer]] | How a session changes hands, how an edge is declared and when it is resolved, and what a handover deliberately does not change |
| `convention` | [[agent-suites]] | Where the real-provider tests live, why they run through the example application, and what a Gemini model can actually finish |
| `pattern` | [[agent-delegation]] | How one agent has another answer a single task, why neither reads the other's conversation, and where the runtime's only dependency cycle lives |
| `pattern` | [[structured-output]] | Why an agent declares the shape of its answer instead of a call asking for one, and what a run does with the value |
| `pattern` | [[multimodal-input]] | How an image reaches a model, why the journal never holds one, and what a tool result cannot carry |
| `pattern` | [[tool-access]] | How an actor reaches a tool, where the one access rule is asked, and why an MCP server walks the agent's own gate |
| `pattern` | [[tool-declaration]] | What a shared tool extends, how one schema types both forms of a tool, and why the method form has its own descriptor type |
| `pitfall` | [[nest-composition-timing]] | Why the runtime is composed in a lifecycle hook and never in a provider, and why the module's options may come from the container |
| `pattern` | [[test-bed]] | How a test replaces the model of one agent, what a run is asserted on, and why the bed refuses to boot |
| `pattern` | [[tool-doubles]] | How a substituted tool keeps its declaration, what a double has to preserve, and when a listed tool fails the boot |
| `pitfall` | [[cross-provider-history]] | What breaks when a history written by one model is replayed to another, and where the adapter compensates |
| `pitfall` | [[tool-result-injection]] | Why text a tool returns is untrusted, where it reaches the model unmarked, and what the lib does not defend |
| `pattern` | [[agent-prompting]] | Where an agent's prompt is built, why once per agent per run, and what a variable in it costs |
| `pitfall` | [[money-precision]] | Why an amount is an integer count of pico dollars in a bigint, and where the single lossy step is allowed to be |
| `pattern` | [[run-pricing]] | Where a call is collected, when it is priced, and why nothing about a bill can fail a run |
| `pattern` | [[mcp-authorization]] | Where the OAuth flow is split, why a failed renewal is classified rather than reported, and what decides whether cleartext is allowed |
| `entity` | [[artifacts]] | What an artifact is, the three things an attachment can point at, how one is changed in place without breaking a conversation, and what a tool answers for bytes it cannot read |
| `pattern` | [[artifact-exploration]] | The tools a model reads and edits an artifact with, which of them an agent has to ask for, what each answer is allowed to cost, and what a store that dies with the process takes with it |
| `pattern` | [[storage-adapters]] | What a session storage written outside this package is given, why it is codecs and not parts, and how a fabricated event fails in silence |
