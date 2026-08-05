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
| Classes | Nothing about any framework | `CostCalculator`, `InstructionBuilder` |
| Module | The internal container only | `pricing.module.ts` |
| Nest adapter | NestJS and the internal container | `AdkModule` |

A class receives its dependencies in the constructor and never imports the container. See [[services-over-functions]]. The module file does the wiring. The Nest adapter is the only place that imports `@nestjs/common` or `@nestjs/core`.

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
  cost-calculator.ts    # private
  price-resolver.ts     # private
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

## The provider SDK is one engine, not the foundation

The same reasoning applies to `@google/adk`: today it owns the agentic loop (Runner, LlmAgent, compaction, streaming modes), and every correction the lib needs becomes another `BaseLlm` wrapper around its contract. The target is a native engine implementing `AdkEngine` directly over the neutral `AdkModel` contract (`packages/core/src/lib/types/model-io.ts`), with the ADK remaining as one engine behind the same abstraction. Semantics, such as model failover, keep moving into the core as they are touched; the loop itself is the remaining piece.

## What is still missing

This guideline is `status: target`. Today the core depends on NestJS in about thirty places:

- `@Injectable()` decorates almost every class, including `InMemorySessionStore`, `Similarity` and `ContextCollector`.
- `Type` from `@nestjs/common` is used as the base class type in `model-specs.ts`, `agent-definition.ts` and `options.ts`.
- `AgentRegistry` uses `DiscoveryService` and `ModuleRef` (`packages/core/src/lib/registry/agent-registry.ts:1`), which is the discovery step described above and belongs in the Nest adapter.
- `RunLogger` and `AdkEmbedder` use the Nest `Logger`.
- `AdkEmbedder.setActive()` (`packages/core/src/lib/module/adk.module.ts:65`) keeps the active embedder in static state, which the section above forbids.

Until the migration finishes, new code follows this guideline and does not add new imports of `@nestjs/common` outside the adapter.
