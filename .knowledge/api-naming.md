---
title: API naming
description: Semantic names for internal entrypoints, methods, predicates and fallible lookups
type: convention
status: target
tags: [core, api, naming]
---

Name APIs so high-level code reads as a description of the operation. Use direct domain verbs and role-specific class names.

## Entrypoint roles

- `Runtime`: facade for a complete runtime subsystem, such as `AgentRuntime`.
- `Runner`: owns an iterative lifecycle, such as `AgentRunner`.
- `Executor`: performs one bounded operation, such as `ToolExecutor`.
- `Service`: the high-level API exported by one feature module, such as `SessionService`.
- `Factory`: creates an entity or runtime object from dynamic data, such as `AgentRunFactory`.

Do not add a generic `UseCase` suffix. Name the class from its responsibility in the module.

Use role names such as `Builder`, `Mapper`, `Projector`, `Validator`, `Policy`, `Strategy`, `Store`, `Coordinator`, `Collector`, `Serializer` and `Adapter` for focused collaborators. Do not call every class a service.

## Method verbs

Use a precise verb such as `create`, `restore`, `append`, `prepare`, `compact`, `execute`, `approve`, `reject`, `publish` or `dispose`.

Avoid `process`, `manage`, `do`, `runLogic`, `helper` and `utils`. Use `handle` only when the class implements an explicit handler contract.

## Predicates

- `is`: current state, such as `isActive`.
- `has`: possession or existence, such as `hasPendingApproval`.
- `can`: capability at this moment, such as `canRetry`.
- `supports`: declared capability, such as `supportsStreaming`.
- `should`: policy decision, such as `shouldCompact`.
- `requires`: requirement, such as `requiresApproval`.

## Fallible lookups

Make absence explicit in the method name:

- `find` returns an optional value;
- `findOrFail` returns the value or throws a module-owned error;
- `load` performs external I/O and may return no value;
- `loadOrFail` performs external I/O and throws when the value does not exist.

Use the `OrFail` suffix. Do not use `get` to hide whether absence is possible.

## What is still missing

Existing APIs use generic names and inconsistent failure semantics. Rename them as each module is refactored.
