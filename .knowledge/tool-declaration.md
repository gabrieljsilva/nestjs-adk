---
title: Declaring a tool
description: What a shared tool extends, how one schema types both forms of a tool, and why the method form is checked through a descriptor of its own
type: pattern
tags: [core, tools, decorators, typescript]
---

A tool has two forms and one entry point.

A **shared tool** is a class of its own, decorated with `@Tool` and extending `AdkTool<typeof schema>`. It becomes a provider, so it injects services like anything else, and `execute` is what the runtime calls.

A **tool of one agent** is a method on the agent, decorated with the same `@Tool`. There is nothing to extend, because the method is already inside a class, and the method itself is the entry point.

Both receive the same two arguments, and the difference between them is the reason to keep them apart. `input` is what the model decided, already parsed by the schema, so keys it invented are gone before the method runs. `context` is what the run knows: session, call and cancellation signal. Anything the model must not be allowed to choose, a tenant id being the usual one, travels in `context` and never in the schema. See [[tool-approval]] for what happens between the two when the effect is destructive.

## The schema types the input

`ToolOptions<TSchema>` is generic and `TSchema` is inferred from the `schema` the decorator was given, so the decorator knows the input type of the tool it is decorating:

```ts
const schema = z.object({ orderId: z.string() });

@Tool({ name: "find_order", description: "Finds an order.", schema, effect: "read" })
export class FindOrderTool extends AdkTool<typeof schema> {
	public execute(input: z.infer<typeof schema>): unknown { ... }
}
```

Declaring the shape by hand instead of `z.infer` compiles only while the two agree, which is the point: the schema is the single description of the input, and a field renamed in one place stops the build in the other.

## Why the method form has its own descriptor type

The class form is checked through the constructor: `ToolClass<TSchema>` is `abstract new (...args: never[]) => AdkTool<TSchema>`, which accepts any constructor and demands the instance answer `execute`.

The method form cannot use `TypedPropertyDescriptor<T>`. That interface carries both `value?: T` and `set?: (value: T) => void`, so `T` sits in a covariant and a contravariant position at once and the check becomes invariant: a method that takes only the input, ignoring the context it never uses, would be rejected. `ToolMethodDescriptor<TSchema>` declares `value` alone, which asks the one question worth asking, namely whether the method accepts what the schema parses.

## What the compiler does not check

TypeScript is structural, so a class that never extends `AdkTool` but declares a compatible `execute` is still accepted by `@Tool`. Extending is how the input gets typed for free, not a gate.

The runtime keeps its own check for everything reflection can still meet: `NestToolFactory` resolves `execute` by name and raises `InvalidAgentMetadataError` when it is missing, which is what catches a tool built by anything other than the decorator. See [[type-safety]] for the restrictions the rest of the lib follows and [[module-boundaries]] for why classes like this one are exported at all.
