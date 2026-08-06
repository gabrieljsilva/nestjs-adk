---
title: Testing conventions
description: What earns a spec, what each level of test is responsible for, and where each one runs
type: convention
status: target
tags: [core, tests, typescript]
---

Pair a production `.ts` file that ships behaviour with a unit test of the same basename and the `.spec.ts` suffix.

```text
tool-call-result.ts
tool-call-result.spec.ts
```

Behaviour is what a spec can exercise: a method, a getter, a constructor that computes rather than storing what it was handed. What that leaves out is the declaration, and a declaration has nothing to assert: a contract of abstract members, an event that is its own payload, a failure that is a name. A spec for one of those restates the file in a second file, and then two have to be kept in step to prove nothing. Writing one anyway is never wrong, and it is worth it the moment the class grows a decision.

The measure is coverage, not the count of files. `npm run test:coverage` reports it over `packages/*/src/**`.

Test the public behavior of the file, not its private implementation.

- A value object test covers construction, invariants, restoration and equality behavior.
- A service test uses doubles for every constructor dependency.
- An adapter test covers translation in both directions and external failure mapping.
- A module test covers registrations and exported boundaries.
- A barrel test covers the intended export surface.
- A type-only contract test uses compile-time assertions when runtime behavior does not exist.

Keep integration tests in addition to the paired unit test. They do not replace it.

## Where a test runs

The suffix decides the level and the path decides the project, and the two together are what a command selects. A test that costs nothing runs on every change; a test that spends money runs when someone asks for it.

| suffix | level | library | application |
| --- | --- | --- | --- |
| `.spec.ts` | one file, doubles for its collaborators | `unit` | `playground` |
| `.e2e.spec.ts` | the whole thing booted, no network | `integration` | `playground` |
| `.ai.spec.ts` | a real provider, real money | none | `playground:agents` |

`npm run test` is the library, `npm run test:playground` is the application, and neither reaches a provider. The one paid project is `npm run test:playground:agents`, which runs one file at a time on a single key. The library has no provider suites: what it does against a real model is proved through the application, where the public API is the thing under test. See [[agent-suites]] for what belongs in one and why the suffix is `.ai`.

Every bug fix adds a test that fails for the reported behavior before the correction. Every class branch and error path must be observable through its public methods.

Test doubles belong to the Support layer. Production modules never export private collaborators only to make tests easier.

## Testing an agent

An agent is tested through the application it lives in, not by building a runtime by hand. `@nestjs-adk/testing` boots the real module and replaces the model of each agent; assertions read the run, which carries the events it published. A use case that merely hands a request to an agent is a different question, and `AgentStub` answers it without a runtime. See [[test-bed]], and [[tool-doubles]] before replacing a tool with anything.

## What is still missing

Files with behaviour and no spec are still spread across the tree. Add the missing test when each one is moved or rewritten, and let coverage say how far that has got rather than a rule that counts files.

An architecture guard used to enforce the pairing by file count. It was removed: of its 182 findings, 162 were the pairing rule and 20 sat in `packages/mcp`, which has not been rewritten, while the two rules nothing else can do, layer dependency and external import, were already at zero. See [[layer-boundaries]] and [[module-boundaries]] for the architecture it was checking.
