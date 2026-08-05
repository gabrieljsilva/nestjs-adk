# nestjs-adk

Agent Development Kit for NestJS. Monorepo (npm workspaces and turbo) with `packages/core`, `packages/google`, `packages/mcp`, `packages/testing` and `apps/playground`.

## Knowledge base

`.knowledge/` holds the guidelines that define how this lib is written. They are the source of truth for conventions. When a guideline and the surrounding code disagree, follow the guideline.

**Before you write or change code, read `.knowledge/index.md`.** It is a table of every guideline with a one line description. Open the rows that match the task, then follow the links inside them. A link written as `[[<slug>]]` is the file `.knowledge/<slug>.md`.

Use grep when the index is not enough:

```bash
grep -l "^type: pitfall$" .knowledge/*.md     # known traps, read these before a fix
grep -rl "tags:.*pricing" .knowledge/          # everything about one subsystem
grep -rl "\[\[error-taxonomy\]\]" .knowledge/  # which guidelines point to this one
```

Guideline types: `entity` (what a concept is), `pattern` (how to build something), `convention` (how we write it here), `pitfall` (what breaks and why), `reference` (what an external source says).

### Keeping it current

When the work shows something a future reader needs and no guideline covers it, write one. For example: a convention you had to infer by reading three files, a trap that cost real debugging time, or external behavior you had to look up.

- Format and frontmatter: `.knowledge/writing-guidelines.md`.
- External links: `.knowledge/citing-sources.md`.
- Add the new file as a row in `.knowledge/index.md` in the same change. Nobody finds a guideline that is missing from the index.
- Prefer fixing an existing guideline over adding a similar one.
- A guideline that contradicts the code is worse than no guideline. Fix it when you see it.

Do not put conventions in this file. This file only explains how to find them.

## Commands

```bash
npm run build      # turbo build across packages
npm run typecheck  # tsc -p tsconfig.tests.json
npm run test       # vitest, unit and integration projects
npm run lint       # biome check .
```
