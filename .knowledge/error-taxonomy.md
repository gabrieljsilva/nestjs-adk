---
title: Error taxonomy
description: Ownership, declaration and propagation of errors, and how an adapter classifies a provider failure
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

## Classifying a provider failure

An adapter turns the error of its provider into one of the failures the core declares. Two questions decide which, and they are asked with a predicate rather than `instanceof`, because an adapter ships as its own package and two copies of the core in one tree would make the identity check answer no to a failure that plainly is one.

- `isTransient`: could the same model, sent the same thing, succeed on a second try. Only rate limits, timeouts and an unavailable provider say yes.
- `isInvalidRequest`: did the provider refuse the request rather than fail to answer it. A schema it will not take, a field this model does not support, a key it does not accept, a model that does not exist.

A refused request is the one failure a failover chain must not answer by trying the next model, because every model in the chain is sent the same request. `SequentialFailoverPolicy` stops on it. A policy that wants the other bet, that a second provider accepts what the first refused, is free to make it: `next` is handed the failure precisely so it can be decided on.

Classify a 4xx that is none of the recognised cases as `InvalidRequestFailure`, never as `UnknownFailure`. Left unknown it reads like the provider had a bad day, and the caller pays a call per model in the chain to be told the same thing.

What an adapter genuinely cannot place stays `UnknownFailure`, which is not transient. Guessing a permanent error into a retryable one is how a failover turns into a loop.

## Stability

Error code and branch are public contracts. Changing either is a breaking change. The message may improve without becoming a contract.

## What is still missing

Current errors share files and a global barrel without module ownership. Split and relocate them during the refactor.
