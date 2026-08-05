---
title: Type safety and data transfer
description: TypeScript restrictions and class-based data contracts across architectural layers
type: convention
status: target
tags: [core, typescript, architecture]
---

Keep uncertainty at system boundaries. Convert it into validated class instances before data enters another layer.

## TypeScript restrictions

- Never use `any`. Use `unknown` until validation proves a type.
- Never use a type assertion with `as`.
- Use `satisfies` to check an expression without changing its inferred type.
- Narrow `unknown` with validators, discriminants or class constructors.
- Do not use non-null assertions to hide an invalid lifecycle.

## Layer contracts

Do not pass plain objects between layers. Commands, results, events, DTOs, identifiers, state and persisted records are class instances.

Do not return a plain object from domain, runtime, contract or adapter APIs. Return an instance that owns its invariants.

```ts
const command = AskAgentCommand.restore(requestRecord);
const result = await runtime.ask(command);
return AgentRunResponse.from(result);
```

Raw JSON, database rows and provider payloads enter as `unknown` at an adapter boundary. The adapter validates them and creates a record or DTO class immediately.

## Restoration and serialization

Give persisted domain objects a direct restoration path. Use named constructors such as `create`, `restore`, `succeeded`, `failed` and `rejected` when they prevent invalid combinations.

Serialization may produce primitives and JSON-compatible values at the final storage or transport boundary. Those values do not travel back through the runtime as domain data.

Structured payload value objects may contain `string` or `Readonly<Record<string, unknown>>`. The containing class owns the discriminator, validation and immutability.

## What is still missing

The current API and runtime pass plain object shapes, use assertions and expose records without domain invariants. Replace them module by module.
