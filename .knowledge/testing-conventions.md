---
title: Testing conventions
description: Unit test pairing and test responsibilities for every TypeScript production file
type: convention
status: target
tags: [core, tests, typescript]
---

Pair every production `.ts` file with a unit test file using the same basename and the `.spec.ts` suffix.

```text
tool-call-result.ts
tool-call-result.spec.ts
```

Test the public behavior of the file, not its private implementation.

- A value object test covers construction, invariants, restoration and equality behavior.
- A service test uses doubles for every constructor dependency.
- An adapter test covers translation in both directions and external failure mapping.
- A module test covers registrations and exported boundaries.
- A barrel test covers the intended export surface.
- A type-only contract test uses compile-time assertions when runtime behavior does not exist.

Keep integration and architecture tests in addition to the paired unit test. They do not replace it.

Every bug fix adds a test that fails for the reported behavior before the correction. Every class branch and error path must be observable through its public methods.

Test doubles belong to the Support layer. Production modules never export private collaborators only to make tests easier.

## What is still missing

Many current TypeScript files have no paired unit test. Add the missing test when each file is moved or rewritten.
