---
title: Comments and JSDoc
description: When code comments are allowed and what public API documentation must explain
type: convention
status: target
tags: [core, documentation, code-style]
---

Make code explain itself through names, types, classes and methods. Add a comment only when the code cannot express an important constraint.

## Allowed comments

Use a short comment for:

- a magic value whose origin or external constraint is not visible in code;
- a provider quirk or protocol rule that forces a surprising implementation;
- a safety, ordering or compatibility constraint that a refactor could easily break;
- a temporary compatibility bridge with a clear removal condition.

Explain why the constraint exists. Do not narrate what the next line does.

```ts
// The provider rejects a tool response when its matching call is not present.
const boundary = obligations.findLastClosedBoundary();
```

## Forbidden comments

- Do not restate a class, method, condition or assignment.
- Do not leave implementation diaries or commented-out code.
- Do not use comments to divide a large class into responsibilities. Split the class.
- Do not keep stale `TODO` text without an owned issue or plan item.
- Do not explain a poor name. Rename the symbol.

## Public JSDoc

Add JSDoc to every public API. Describe only what a consumer needs:

- the contract and observable effect;
- lifecycle or persistence behavior;
- relevant errors;
- non-obvious security or resource implications.

Do not expose internal wiring or repeat TypeScript types in prose.

## What is still missing

Existing source files contain narrative and redundant comments. The refactor must remove them and add consumer-focused JSDoc to the public API.
