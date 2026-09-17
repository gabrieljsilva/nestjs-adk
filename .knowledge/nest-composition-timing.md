---
title: Composing on module init
description: Why the runtime is composed in a lifecycle hook and never in a provider, what NestJS does to an instance captured too early, and why the module's options may come from the container
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

- `ComposeRuntimeUseCase` owns the four steps, read the container, read the decorators, compose, bind, and the module only calls it from the hook. The reading is one call per thing read on `NestScanService` (`readProviders`, `readSharedTools`, `readAgents`, `readExposedTools`), which is where the five scanners live and where the order they run in is written down;
- anything the container builds before init holds `StartedRuntime` rather than `RuntimeServices`, because the runtime does not exist yet. `AgentRegistry` reads `host.runtime` per call for that reason;
- `NestProviderScan`, behind that service, refuses what it cannot use instead of skipping it: a request or transient scoped component has no single instance to bind, and a declared component without an instance means the scan ran too early. Both raise `UnusableComponentError`.

## Why the options may come from the container

The same timing is what makes `AdkModule.forRootAsync` safe, and the reason it is one provider rather than a second module.

Every provider the module declares reads the options through `ADK_OPTIONS` instead of capturing them in a closure. Nothing else knows when they arrived, only that the token answers, so `forRoot` and `forRootAsync` differ in exactly one entry: a `useValue` or a factory. Composition then happens in the hook either way, by which point the container has resolved the token like any other.

The old argument against it, that asking the container for what is needed to build the container makes a boot order unreadable, applies to a provider composing during `createInstances`. It does not apply here: `ADK_OPTIONS` depends on an imported module's exports, which is an ordinary edge NestJS resolves before constructing anything in this module. The one thing it forbids is real and worth stating: the factory may not inject a token this module itself provides, because `SessionStorage` cannot be an input to the decision about what `SessionStorage` is.

`useClass` is the form to reach for. A factory's dependencies are an `inject` array TypeScript cannot check against the parameters that receive it, so two entries swapped compile and fail at boot, while a constructor is checked like any other provider's. `useFactory` types its parameters `never` rather than `any`, which is what lets a factory of any shape be accepted at all and means an unannotated parameter carries no type into the body.

## Testing it

A suite that only asserts which tools were offered to the model passes with a runtime composed entirely around shells. To catch this, a test needs a tool **and** an agent that inject something, and it has to assert the result rather than the wiring: the tool's output as the model received it, and `ask` through the injected agent class. See [[testing-conventions]] for where such a test belongs and [[module-boundaries]] for why NestJS stays at the surface.
