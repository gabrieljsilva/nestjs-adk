---
title: Module boundaries
description: How the lib is split into internal modules, what each one exports, and why NestJS stays at the surface
type: pattern
status: target
tags: [core, architecture]
---

The lib is built around one concept: the agent. Everything else (tools, skills, prompts, MCP, pricing, sessions) is optional support around it. An agent runs without skills, without MCP and without a complex prompt. Because the parts are optional, each one is a module that works on its own, and the modules stay independent.

## The three layers

| Layer | Knows about | Example |
| --- | --- | --- |
| Classes | Nothing about any framework | `RunCostReporter`, `PromptBuilder` |
| Module | The internal container only | the composition files under `runtime/composition/` |
| Nest adapter | NestJS and the internal container | `AdkModule` |

A class receives its dependencies in the constructor and never imports the container. See [[services-over-functions]]. The module file does the wiring. The Nest adapter is the only place that imports `@nestjs/common` or `@nestjs/core`.

This split is about who knows the framework. Which responsibility a class carries is the separate question [[layered-responsibilities]] answers: an edge, a use case, a service or a repository. A Nest adapter is always an edge, and the service a module exports is always the Service layer.

## What a module exports

Three things, and nothing else:

1. **The module**, which declares the providers and what they export.
2. **One service**, which is the API of that module. Other modules call this service and never reach the classes behind it.
3. **The classes the developer extends or implements**, like `AdkTool`, `AdkSkill` and `SessionStore`.

Everything else stays private to the module. A class that is not exported can be replaced without a breaking change, and that freedom is the reason to keep the export list short.

```
pricing/
  pricing.module.ts     # wiring
  pricing.service.ts    # the API of the module
  cost-calculator.service.ts   # private
  price-resolver.service.ts    # private
```

## There is no internal container

There used to be one, `@wirely/core`, and on 2026-09-17 it was removed with its dependency. Every provider it held was registered as a value the composition had already built, so `container.get(X)` answered the variable three lines above it: a map from a class to something already in scope, plus an `init` and a `dispose` that had nothing to do.

What replaced it is three composers in `runtime/composition`, each with one `compose`: `ContextComposer` builds what turns a journal into what a model reads, `RunComposer` builds everything a command touches, and `SessionComposer` builds the read half of sessions. `RuntimeFactory` calls the three in that order and hands back `RuntimeServices`.

The rule the container existed to protect still holds, and now holds by construction: nothing about how the runtime is wired appears in `src/index.ts` or in any public signature.

## The bridge runs in one direction only

The NestJS container owns the classes the developer wrote. The composition owns the runtime of the lib, and it resolves nothing:

1. The Nest adapter discovers the classes of the developer (agents, tools, skills) and reads them off the container NestJS has finished building, which is what gives them access to their own dependencies, like a repository or an HTTP client. `NestScanService` is the one door onto that reading.
2. The adapter hands the resolved result to the composition as a value.
3. The composed runtime depends on that value, and never asks the Nest container for anything.

If the composition also resolved from Nest, the two graphs would depend on each other, and the boot order would stop being predictable.

## The framework-free entry point

NestJS is a surface, and a surface has to be optional or it is the foundation. `createAdkRuntime({ agents })` is the proof: agents in, a started runtime out, no container anywhere.

Two rules keep the two paths one path rather than two implementations of the same idea.

- **One defaults table.** `RuntimeDefaults` decides what a runtime composes with when the application named nothing: sessions in memory, artifacts in memory, the system clock, random ids. `AdkModule` registers each one behind its token and `AdkRuntime.start` fills in what it was not handed, and both read that table. Written twice they drift on the first change, and the same application would store conversations in one place under NestJS and in another without it.
- **One agent surface.** `StartedAdkRuntime.findAgent` answers an `AgentHandle`, which is the class a NestJS application injects as `AdkAgent`. Neither entry point owns a verb the other lacks, for the reason `AdkAgent` stopped mirroring the handle method by method: two copies of thirteen methods drift, and the copy an editor offers is the one nobody updated.

What follows from that is where a class lives. Anything both paths use is framework-free by definition, so it sits outside `public/nest`: `AgentHandle` in `public/agent/`, `RandomIdGenerator` in `common/identity/`, `RuntimeDefaults` and `AdkRuntime` in `public/`. A class under `nest/` that imports no `@nestjs/*` is a class in the wrong folder.

## No global state

A module never stores state in a static field, in a module level variable, or in a singleton imported at the top of a file. State lives in an instance, and the instance arrives through the constructor. Global state makes two containers in the same process overwrite each other, and it makes tests depend on the order they run.

## A provider SDK is one adapter, never the foundation

The same reasoning applies to a vendor SDK. The lib no longer depends on `@google/adk`: it owns the agentic loop itself, and a provider reaches it through the neutral model contract. `@nestjs-adk/google` is the Gemini adapter and holds every Gemini specific mapping (`packages/google/src/mapping/gemini-request.mapper.ts`, `gemini-failure.mapper.ts`, `gemini-stream.mapper.ts`). Nothing in the core knows a provider name.

Keep it that way: a semantic that a second provider would also need belongs in the core, not in the adapter that discovered it. Model failover is in the core for that reason.

## What is still missing

This guideline is `status: target` for one reason only: the module split itself.

What already holds, verified on 2026-09-14: no file under `packages/core/src` or `packages/google/src` imports `@nestjs/*` outside `public/nest` and `adapters/nest`; there is no static mutable state in the core; and, since 2026-09-17, the core has no runtime dependency at all, so no container type can appear in the public surface.

What does not hold yet:

- `packages/mcp/src/lib/` and `packages/testing/src/` import `@nestjs/*` throughout, outside any `nest/` folder. Both packages are Nest-facing by design, so the fix is to move the Nest-aware classes into a `nest/` folder inside each package rather than to remove the imports.
- The core is not split into modules yet. `contracts/`, `domain/`, `runtime/` and `adapters/` are layer-first folders, so no module owns a boundary, exports one service, or keeps the rest of its classes private. The grouping happens in the folder reorganization, and the one-service rule follows it.

Until the split lands, new code follows this guideline and does not add a `@nestjs/*` import outside a `nest/` folder.

`packages/core/src/public/runtime-defaults.factory.e2e.spec.ts` is what holds the two entry points to one table: it boots both and compares the classes each composed with.
