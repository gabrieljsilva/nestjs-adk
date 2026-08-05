---
title: Services over functions
description: Behavior lives in classes with explicit dependencies and free functions stay at unavoidable language boundaries
type: convention
status: target
tags: [core, architecture, oop]
---

Use classes as the default unit of behavior. Group methods by one semantic context and expose dependencies through the constructor.

## Free functions

Do not implement domain, runtime, adapter or support behavior as a free function, even when it is pure.

A free function is allowed only when the language or an external API requires one:

- TypeScript decorators;
- callbacks passed to an external contract;
- Wirely module declarations inside composition files;
- a temporary compatibility wrapper for an existing public function.

Keep an allowed function thin. Delegate owned behavior to a class method. New public builders and utilities use static named constructors or value object methods.

## Class boundaries

- One production file defines and exports at most one class.
- One class owns one responsibility.
- A class does not share its file with another class, including an error class.
- Prefer instance methods for behavior with dependencies or lifecycle.
- Use static methods for named constructors, restoration and behavior intrinsic to a value object.
- Do not use static mutable state.
- Barrel and module files contain no behavior.

```ts
export class AgentRunFactory {
	public constructor(private readonly clock: Clock) {}

	public create(command: AgentRunCommand): AgentRun {
		return AgentRun.create(RunId.create(), command, this.clock.now());
	}
}
```

## Dependencies

- Receive every dependency through the constructor as `private readonly`.
- Do not read mutable module-level state or `process.env` inside behavior.
- Do not resolve dependencies from a container inside a class.
- Depend on abstract ports, not concrete adapters.
- The class never knows whether NestJS or Wirely constructed it.

## Module API

One service is the high-level API of a feature module. It coordinates focused collaborators and other module services. Private collaborators never cross the module boundary. See [[module-boundaries]].

## What is still missing

The current code contains internal free functions, multi-class files, static state and framework-aware services. Replace them during the refactor.
