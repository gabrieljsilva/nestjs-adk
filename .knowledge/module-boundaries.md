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

## The internal container is invisible

The internal container is `@wirely/core` (https://github.com/gabrieljsilva/wirely). It is an implementation detail. The developer using the lib writes NestJS and never learns that it exists.

Rules that keep it invisible:

- `@wirely/core` is a `dependency`, never a `peerDependency`. A peer range makes every major of the container a major of this lib.
- No type from the container appears in `src/index.ts`, in a public method signature, or in a public type. If a `Container` or a module definition leaks into the public API, replacing the container becomes a breaking change.
- Errors from the container never reach the user. Catch them at the adapter and rethrow as an `AdkError`. See [[error-taxonomy]].

## The bridge runs in one direction only

Two containers exist at runtime: the NestJS container, which owns the classes the developer wrote, and the internal container, which owns the runtime of the lib.

The bridge goes from Nest to the internal container, and never back:

1. The Nest adapter discovers the classes of the developer (agents, tools, skills) and resolves them with the Nest container, which is what gives them access to their own dependencies, like a repository or an HTTP client.
2. The adapter passes the resolved result into the internal container as a value provider.
3. Internal services depend on that value, and never ask the Nest container for anything.

If the internal container also resolved from Nest, the two graphs would depend on each other, and the boot order would stop being predictable.

## No global state

A module never stores state in a static field, in a module level variable, or in a singleton imported at the top of a file. State lives in an instance, and the instance arrives through the constructor. Global state makes two containers in the same process overwrite each other, and it makes tests depend on the order they run.

## A provider SDK is one adapter, never the foundation

The same reasoning applies to a vendor SDK. The lib no longer depends on `@google/adk`: it owns the agentic loop itself, and a provider reaches it through the neutral model contract. `@nestjs-adk/google` is the Gemini adapter and holds every Gemini specific mapping (`packages/google/src/mapping/gemini-request.mapper.ts`, `gemini-failure.mapper.ts`, `gemini-stream.mapper.ts`). Nothing in the core knows a provider name.

Keep it that way: a semantic that a second provider would also need belongs in the core, not in the adapter that discovered it. Model failover is in the core for that reason.

## What is still missing

This guideline is `status: target` for one reason only: the module split itself.

What already holds, verified on 2026-09-14: no file under `packages/core/src` or `packages/google/src` imports `@nestjs/*` outside `public/nest` and `adapters/nest`; there is no static mutable state in the core; `@wirely/core` is a plain dependency (`packages/core/package.json:45`) and no container type appears in the public surface.

What does not hold yet:

- `packages/mcp/src/lib/` and `packages/testing/src/` import `@nestjs/*` throughout, outside any `nest/` folder. Both packages are Nest-facing by design, so the fix is to move the Nest-aware classes into a `nest/` folder inside each package rather than to remove the imports.
- The core is not split into modules yet. `contracts/`, `domain/`, `runtime/` and `adapters/` are layer-first folders, so no module owns a boundary, exports one service, or keeps the rest of its classes private. The grouping happens in the folder reorganization, and the one-service rule follows it.

Until the split lands, new code follows this guideline and does not add a `@nestjs/*` import outside a `nest/` folder.
