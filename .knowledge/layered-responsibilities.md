---
title: Layered responsibilities
description: What an edge, a use case, a service and a repository may each contain, and why dirty code moves inward
type: convention
status: target
tags: [core, architecture, layers]
---

Every class belongs to one of four layers: Edge, UseCase, Service, Repository. The layer decides what the class may contain and what its name ends with. This is the vocabulary [[layer-boundaries]] and [[module-boundaries]] use when they talk about a layer.

The call direction is fixed: Edge calls a UseCase, a UseCase calls Services, a Service calls Repositories and its own role collaborators. Nothing calls back outward.

## Edge

I/O and the public API. An edge converts input into a command, calls one use case, and converts the result into a public shape. It holds no logic: no loop, no branch on domain state, no arithmetic.

Suffix: `Handle`, `Module`, `Agent`, `Tool`, or a decorator. `AgentHandle` (`packages/core/src/public/nest/agent-handle.ts`), `AdkModule`, `AdkAgent` and the `read_artifact` tool are the edges today.

## UseCase

One operation of the lib, orchestrating services. It may call several. It has one public method, `execute`. It contains no loop, no arithmetic and no direct I/O: every step it takes is one call on a service whose name says what the step is.

Suffix: `UseCase`.

## Service

The high-level API of one module. Each method does one thing and says so in its name. Loops and branches live here, or in a role collaborator the service owns (`Loop`, `Projector`, `Executor`, `Gate`, `Codec`).

Suffix: `Service` for the module API; collaborators keep their role name.

A service never stores a per-run context in a field. It receives the `RunContext` as its first parameter and forgets it when the method returns. Two runs share one service instance, so a field is state that leaks between them, and that is the rule that keeps the lib stateless. Same reason as the no-global-state rule in [[module-boundaries]]. `run-context-statelessness.spec.ts` enforces it over `runtime/`; [[run-context]] has the four exemptions and why each one is a run rather than a collaborator.

## Repository

The final destination: storage, network, filesystem, model provider. It translates an external failure into an error the lib owns, see [[error-taxonomy]].

Suffix: `Storage`, `Source`, `Adapter`, `Transport`.

## Dirty code goes to the innermost layer that can hold it

A `for`, a nested `if`, arithmetic, a filesystem call or a network call in an edge or a use case is a finding. Move it inward until it reaches the layer whose job it is. The point is not tidiness: a loop in a use case makes the use case untestable without the services behind it, and a branch in an edge is a decision the application cannot replace.

Constructor arity drops as a consequence of this move, never the other way round. See [[component-heuristics]].

## What is still missing

The mapping from today's names to the target, verified against `packages/core/src` on 2026-09-14:

| Layer | Today | Becomes |
| --- | --- | --- |
| Edge | `AgentHandle`, `AdkModule`, `AdkAgent`, `read_artifact` | Same names. `AdkAgent` stops mirroring `AgentHandle` method by method and exposes the handle |
| Edge | `AdkRuntimeHost` (`packages/core/src/public/adk-runtime-host.ts`) | `AdkRuntime`: it imports nothing from Nest |
| UseCase | `AskAgent`, `DecideApproval`, `DelegateAgent` (`packages/core/src/runtime/run/`) | `AskAgentUseCase`, `DecideApprovalUseCase`, `DelegateAgentUseCase` |
| UseCase | `AgentSwitch` (`packages/core/src/runtime/transfer/agent-switch.ts`) | `TransferSessionUseCase` |
| UseCase | `AdkComposer` (`packages/core/src/public/nest/adk-composer.ts`) | `ComposeRuntimeUseCase` |
| Service | `SessionManager` | `SessionService` |
| Service | `ContextProjector`, with `TurnLoop` behind it | `ContextService`; `TurnLoop` stays a collaborator |
| Service | `ToolExecutor` | `ToolService`, keeping the executor as a collaborator |
| Service | `ModelRunner` | `ModelService` |
| Service | the five Nest scanners inside `AdkComposer` | one `NestScanService` |
| Repository | `SessionStorage`, `ArtifactStorage`, `PricingSource`, `GeminiTransport` | Same names |

There is no `TransferSession` class: the transfer runtime is `AgentSwitch` plus `TransferGate` in `packages/core/src/runtime/transfer/`. The rename above reflects that.
