---
title: Comments and JSDoc
description: A comment is forbidden; the two exceptions, and the sweep that keeps them near zero
type: convention
tags: [core, documentation, code-style]
---

A comment is forbidden. Writing one is the exception. Code explains itself through names, types, classes and methods, and a name that says less than the body is renamed, not documented; see [[api-naming]].

There are exactly two exceptions.

## 1. JSDoc on high-level public API

A class, method, property or type gets JSDoc only when `packages/core/src/index.ts` exports it **and** a consumer of the lib reads, constructs or implements it: a contract they implement, options they fill, a value object they build, a result they read, an error they catch, a decorator, the handle. When `README.md` never mentions the symbol, treat it as internal.

The JSDoc says only what that consumer needs:

- the contract and the observable effect;
- lifecycle or persistence behavior;
- the errors it raises;
- a security or resource implication they cannot see.

Two to five lines. No history, no internal wiring, no "this used to be", no restating the type.

```ts
/**
 * Where the price of a model comes from. One source is declared for the whole module and every
 * run prices against it.
 *
 * Returning `undefined` is a normal answer and not a failure: the model is reported as
 * unpriced and the run carries on. Throwing is treated the same way.
 */
export abstract class PricingSource {}
```

## 2. A magic value the identifier cannot carry

Before keeping such a comment, rename the constant so the name documents it: `MAX_RETRIES` with a comment becomes `MAX_LLM_REQUEST_RETRIES` without one. Keep a one-line comment only when even a good name cannot say it: an external constraint, a provider quirk, a protocol number.

```ts
// Rounding to nearest: `0.017 * 1e12` is `17000000000.000002` in float.
```

## Everything else is deleted

- JSDoc on an internal class, on a private or protected member, on a getter, on a constructor.
- JSDoc on a symbol exported only so a test or a sibling package can reach it.
- Every `//` that narrates a line, explains a decision or tells the history of a schema.
- Commented-out code, implementation diaries, section dividers inside a class, stale `TODO`s.

Deleted text is not migrated anywhere. Review every comment from scratch: an existing JSDoc is not fine merely because it sits on an exported symbol.

## The sweep

Both counts are expected to be near zero, and a new hit is a review finding.

```bash
grep -rnE '^\s*//' packages/*/src --include='*.ts' | grep -v spec      # narration
grep -rnE '^\s+/\*\*' packages/*/src --include='*.ts' | grep -v spec   # JSDoc on a member
```

Indented JSDoc survives only on a contract method whose obligation the signature cannot carry, such as `ToolSource.close` or `CompactionStrategy.version`.

Both counts are asserted rather than trusted: `packages/core/src/comment-sweep.spec.ts` walks the
five packages and fails on any line comment outside the magic values it names, and on any member
doc outside the contracts it names. A comment that belongs adds a row there in the same change.
