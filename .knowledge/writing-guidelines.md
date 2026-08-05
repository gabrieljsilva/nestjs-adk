---
title: Writing guidelines
description: Format, frontmatter schema and linking rules every file in .knowledge/ must follow
type: convention
tags: [meta, knowledge-base]
---

Every file in `.knowledge/` records one discovery or concept as a guideline for future implementations. Keep only knowledge that changes how code should be designed or written. This file defines the format.

## Frontmatter

Required on every file. YAML, between `---` lines.

```yaml
---
title: Error taxonomy
description: How errors are declared, named and thrown across the lib
type: convention
tags: [core, errors]
sources:
  - https://nodejs.org/api/errors.html#error-propagation-and-interception
---
```

| Field | Required | Purpose |
| --- | --- | --- |
| `title` | yes | Name of the guideline, sentence case |
| `description` | yes | One line, no period at the end. The reader uses it to decide if the file is relevant, so it must say what the file is about |
| `type` | yes | One of the five values below |
| `status` | no | `current` (default) or `target`. See below |
| `tags` | no | Flat list of lowercase slugs used to filter (package name, subsystem) |
| `sources` | no | External URLs that support the discovery or decision |

### status

A guideline with no `status` describes how the code works today. Follow it now.

Use `status: target` when the guideline describes a decision the code has not reached yet. A target guideline is still the rule for new code, but existing code will disagree with it, and that disagreement is expected. Every target guideline ends with a section that lists what is still missing. When the last item is done, remove the section and the `status` field.

Never write a guideline that describes the current code as if it were the target, or the target as if it were current. The reader must know which one they are reading.

## Types

Fixed list. Do not create new values. If no type fits, the file probably covers two subjects, so split it.

| `type` | Answers | Example |
| --- | --- | --- |
| `entity` | "What is X?" | `AdkAgent`, `ModelSpec`, `PricingSource` |
| `pattern` | "How do I build X?" | Add a new model provider, add a store implementation |
| `convention` | "How do we write X here?" | Error naming, test layout, changeset style |
| `pitfall` | "What breaks, and why?" | A peer range that turns a minor release into a major one |
| `reference` | "What does the external source say?" | LiteLLM price map shape, MCP transport spec |

Filter with grep:

```bash
grep -l "^type: pitfall$" .knowledge/*.md
grep -rl "tags:.*pricing" .knowledge/
```

## File naming

Use `kebab-case.md`. One subject per file. No subfolders. The slug (the filename without `.md`) is the id of the node in the graph, so keep it stable. If you rename a file, update every link that points to it.

## Linking

Link to another guideline with the double bracket form, inside the sentence that needs it:

```markdown
Every error extends `AdkError` and carries a stable `code`; see [[error-taxonomy]].
```

Rules:

- Link on the first mention, not on every mention.
- Link only to guidelines that exist. A planned guideline does not belong in the graph or in [[index]] until its file is created.
- Do not add a "Related" section at the end. Put each link in the sentence that needs it.
- When you need to show the syntax instead of using it, write the placeholder as `[[<slug>]]`, with the angle brackets. A real looking name inside double brackets becomes a node in the graph, and a reader who greps for it finds an example instead of a guideline.

## Body

- Start with the rule. Do not write an introduction.
- Use the imperative: "Extend `AdkBootError`", not "you should extend".
- Point to real code with repository paths and line numbers: `packages/core/src/lib/errors/boot.errors.ts:4`.
- Code blocks show the shape to copy. Cut everything else.
- Keep the file under about 150 lines. A longer file covers more than one subject.
- Do not use em dashes. Use `:`, `,`, `;` or parentheses.

## Language

Write in plain English, the way a competent non native speaker writes: simple words, short sentences, one idea per sentence. The reader may also be a non native speaker, or a model, and neither one gains anything from style.

- Prefer the common word: `use` over `leverage`, `about` over `regarding`, `so` over `hence`, `build` over `craft`.
- Keep sentences short. If a sentence needs a comma to work, split it in two.
- No idioms, no metaphors, no wordplay, no cultural references. They do not translate.
- Keep technical terms technical. Do not replace `provider`, `barrel export`, `peer dependency` or `token usage` with vague words. The precision is the point: simple language, exact vocabulary.
- Name a term once, then use the same word every time. A synonym makes the reader think you mean something else.
- Use the active voice: "The runner throws `ToolExecutionError`", not "an error is thrown by the runner".

## Index

`.knowledge/index.md` is the catalog. It has one row per existing guideline, with type, title and description. Do not list planned or removed files. When you create, rename or remove a guideline, update the index in the same change.
