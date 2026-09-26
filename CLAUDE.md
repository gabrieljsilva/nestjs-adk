# nestjs-adk

Agent Development Kit for NestJS. Monorepo (npm workspaces and turbo) with `packages/core`, `packages/google`, `packages/mcp`, `packages/testing` and `apps/playground`.

## Knowledge base

The guidelines that define how this lib is written live in the user's zett vault (MCP tools named `mcp__zett__*`), not in this repo. They are the source of truth for conventions. When a guideline and the surrounding code disagree, follow the guideline.

**Before you write or change code, look up the guidelines that match the task.** The project's hub note is `nestjs-adk` (`personal/projects/nestjs-adk/nestjs-adk.md`); every guideline links up to it. Use `mcp__zett__get_links` on `nestjs-adk` to list them all, `mcp__zett__search` to find one by keyword, tag or type, and `mcp__zett__get_note` to read one. Each guideline keeps its original type (`entity`, `pattern`, `convention`, `pitfall`, `reference`) as a tag, plus a `target` tag when it describes a decision the code has not reached yet.

### Keeping it current

When the work shows something a future reader needs and no guideline covers it, write one, following zett's own conventions (`mcp__zett__get_conventions`, `mcp__zett__get_skill`): create it under `personal/projects/nestjs-adk/`, link it to `nestjs-adk` and to the guidelines it relates to, and cite the git commit it was verified against as a source. Prefer fixing an existing guideline over adding a similar one. A guideline that contradicts the code is worse than no guideline: fix it when you see it.

Do not put conventions in this file. This file only explains how to find them.

## Commands

```bash
npm run build      # turbo build across packages
npm run typecheck  # tsc -p tsconfig.tests.json
npm run test       # vitest, unit and integration projects
npm run lint       # biome check .
```
