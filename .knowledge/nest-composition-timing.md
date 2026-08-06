---
title: Composing on module init
description: Why the runtime is composed in a lifecycle hook and never in a provider, and what NestJS does to an instance captured too early
type: pitfall
tags: [core, nestjs, composition, agents, tools]
sources:
  - https://docs.nestjs.com/fundamentals/lifecycle-events
  - https://github.com/nestjs/nest/blob/master/packages/core/injector/injector.ts
---

The ADK composes its runtime from objects NestJS built: an agent is a provider, a tool is a provider, and both arrive with their own dependencies injected. Reading them at the wrong moment does not fail. It succeeds against objects the container is about to throw away.

## What NestJS does

Instantiation happens in two passes. `createPrototypes` walks every module and gives each provider a shell, `Object.create(metatype.prototype)`, with no constructor run and no dependency set. `createInstances` then builds the real objects, all modules at once, and for an ordinary class provider it **replaces** what the shell step left:

```ts
instanceHost.instance = wrapper.forwardRef
	? Object.assign(instanceHost.instance, new metatype(...instances))
	: new metatype(...instances);
```

Keeping the shell and copying onto it is the exception, reserved for `forwardRef`. The normal path swaps the object, so a reference taken during `createInstances` can point at a shell nobody uses again.

Both failures look nothing like a wiring bug when they surface:

- a tool composed around a shell answers `Cannot read properties of undefined` to the model, as a tool result, so the run continues and the conversation goes on with a hole in it;
- an agent bound on a shell leaves the injected class unbound, and `AgentNotBoundError` arrives from the application's own service.

Only components with constructor dependencies are affected, which is what makes it look intermittent: a provider with no dependencies resolves in the first tick and is already final when a factory reads it.

## The rule

Compose in `onModuleInit`, never in a provider. By the first lifecycle hook `createInstancesOfDependencies` has completed, so every static instance exists and is the one the container will keep. Hooks run deepest module first, so an imported `AdkModule` composes before the application's own hooks and an agent is usable inside them.

That timing decides the shape of everything around it:

- `AdkComposer` owns the four steps, read the container, read the decorators, compose, bind, and the module only calls it from the hook;
- anything the container builds before init holds `StartedRuntime` rather than `RuntimeServices`, because the runtime does not exist yet. `AgentRegistry` reads `host.runtime` per call for that reason;
- `NestProviderScan` refuses what it cannot use instead of skipping it: a request or transient scoped component has no single instance to bind, and a declared component without an instance means the scan ran too early. Both raise `UnusableComponentError`.

## Testing it

A suite that only asserts which tools were offered to the model passes with a runtime composed entirely around shells. To catch this, a test needs a tool **and** an agent that inject something, and it has to assert the result rather than the wiring: the tool's output as the model received it, and `ask` through the injected agent class. See [[testing-conventions]] for where such a test belongs and [[module-boundaries]] for why NestJS stays at the surface.
