---
title: Error taxonomy
description: Ownership, declaration, naming and propagation of errors across feature modules
type: convention
status: target
tags: [core, errors, architecture]
---

Make every error belong to the feature module whose contract failed. Put each concrete error class in its own file.

```text
session/errors/session-not-found.error.ts
session/errors/session-revision-conflict.error.ts
tool/errors/tool-execution.error.ts
model/errors/model-generation.error.ts
```

Use `common/errors/` only when multiple independent modules genuinely own the same concept. Never use `common` as a miscellaneous folder.

## Declaration

- Extend the appropriate ADK base error.
- End the class name with `Error` and describe the problem.
- Declare a stable `public readonly` code in `SCREAMING_SNAKE_CASE`.
- Receive facts in the constructor and build the message inside the error.
- Expose structured facts needed by a handler as readonly fields.
- Preserve an external error as `cause`.
- Translate adapter and container errors before they cross their boundary.

```ts
export class SessionRevisionConflictError extends AdkError {
	public readonly code = "SESSION_REVISION_CONFLICT";

	public constructor(
		public readonly expected: SessionRevision,
		public readonly actual: SessionRevision,
	) {
		super(`Session revision conflict: expected ${expected}, received ${actual}.`);
	}
}
```

## Throwing and lookup names

Use `findOrFail` and `loadOrFail` when absence throws. The thrown error belongs to that module. See [[api-naming]].

Do not throw a string or a plain `Error` from library code. A failure event may report an observable lifecycle fact, but it never replaces throwing the module error that controls execution.

## Errors and failures

Two kinds of value describe something going wrong, and they are told apart by role, not by severity.

An **error** is a control mechanism. It is thrown, it interrupts, and the caller does not continue. Use it when a contract was violated and there is nothing left to decide.

A **failure** is domain data. Nothing throws it: it exists to be inspected by whoever decides what happens next.

```ts
policy.next(failure: ModelFailure, context: FailoverContext): Promise<LlmModel | undefined>
```

A rate limited model is routine in production, not an exceptional condition. Modeling it as a value keeps the decision in one place instead of spreading `try`/`catch` through the runtime, and keeps the reason serializable, since a failure is written to the journal while a stack trace is not domain data.

A failure becomes an error when the decisions run out. The executor collects failures, the policy chooses, and only when the policy returns nothing does the module throw, carrying the collected failures as structured facts.

The rule: **thrown means `Error`, decided upon means `Failure`.** A failure class does not extend the error base, and no code path throws one.

## Stability

Error code and branch are public contracts. Changing either is a breaking change. The message may improve without becoming a contract.

## What is still missing

Current errors share files and a global barrel without module ownership. Split and relocate them during the refactor.
