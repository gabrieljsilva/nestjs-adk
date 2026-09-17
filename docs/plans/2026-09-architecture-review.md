# Architecture review plan

Date: 2026-09-14. Branch of origin: `feat/storage-port-and-run-cancellation`.

Outcome of a full design review of `packages/core` (plus `google`, `mcp`, `testing`) against Google ADK, LangChain/LangGraph, Langfuse and Cline's SDK. Goals agreed with the author:

1. NestJS-shaped DX, and a linear path without decorators that actually compiles.
2. Consumers trust the lib: safe defaults, no hidden state, nothing durable outside `SessionStorage`.
3. Clear responsibility separation following Edge → UseCase → Service → Repository, with "dirty" code (loops, nested ifs, arithmetic, fs, network) pushed to the innermost layer.
4. Everything is a component: every policy the runtime consults is an abstract class the consumer can replace.
5. Naming follows the untimeless-api ADRs 0012, 0018 and 0022 (factories name their source, files declare their category, methods start with a verb and never `somethingOf`).

Each phase leaves the repo green (`npm run typecheck && npm run test && npm run lint`). Phases are ordered so that no phase forces rework of a previous one.

## Review findings in one place

Kept because the design is right: `SessionStorage` as one port with capability-declared optional halves; `ToolCallObserver` as a fail-loud, caller-scoped port separate from `SessionEventConsumer`; `ArtifactStorage` as bytes only; event-sourced HITL with no in-memory continuation; composition in `onModuleInit`; `ADK_OPTIONS` as the only seam between `forRoot` and `forRootAsync`; zero `@nestjs/*` imports outside `adapters/nest` and `public/nest`; no static mutable state anywhere.

Measured on 2026-09-14:

| Metric | Value |
| --- | --- |
| Non-spec lines, all packages | 27 392 |
| Comment lines | 7 048 |
| JSDoc blocks (indented, on members/internals) | 690 |
| Line comments | 181 |
| Distinct `xxxOf` / `xxxFor` methods | 120 |
| `static of()` factories | 52 |
| `static from<Source>()` factories | 3 |
| Files over 300 lines | 3 |

Heuristics adopted as alerts, not verdicts: constructor with more than 6 parameters; class with more than 6 public methods; folder with more than 12 loose production files; a method in an outer layer containing `for`, nested `if`, arithmetic, fs or network. Line count alone is not a finding.

## Phase 1: guidelines first

Nothing below has a criterion until the guidelines say it.

- Rewrite `.knowledge/api-naming.md` from ADR 0022 and ADR 0012: verb-first methods, the verb table (`find`, `get`, `read`, `build`, `create`, `open`, `format`, `emit`, `resolve`, `calculate`), no `Of`/`For`, factories named `from<Source>`, constructor when there is no conversion, the `OrFail` rule kept. Remove the "no `UseCase` suffix" rule.
- New `.knowledge/layered-responsibilities.md`: the four layers, what each may contain, the suffix of each, and the mapping table below.
- New `.knowledge/file-categories.md` from ADR 0018 with the lib-sized table: `.contract.ts`, `.adapter.ts`, `.codec.ts`, `.record.ts`, `.entity.ts`, `.value-object.ts`, `.event.ts`, `.error.ts`, `.policy.ts`, `.strategy.ts`, `.use-case.ts`, `.service.ts`, `.tool.ts`, `.decorator.ts`, `.module.ts`. A spec walks the tree and fails on a file without a category.
- New `.knowledge/component-heuristics.md` with the alerts above.
- New pitfall `.knowledge/tool-result-injection.md`: text returned by a tool is untrusted and reaches the model unmarked.
- Fix `module-boundaries.md` and `layer-boundaries.md`: their "what is still missing" sections describe a `lib/` tree and `AdkEmbedder.setActive()` that no longer exist.
- Update `index.md` rows.

| Layer | Rule | Suffix | Today | Becomes |
| --- | --- | --- | --- | --- |
| Edge | I/O and public API. Converts input, calls one use case, converts output. No logic. | `Handle`, `Module`, `Agent`, `Tool`, decorators | `AgentHandle`, `AdkModule`, `AdkAgent`, `read_artifact` | Same names; `AdkAgent` stops mirroring `AgentHandle` method by method |
| UseCase | Orchestrates services. May call several. No loops, no arithmetic, no direct I/O. | `UseCase`, one `execute` | `AskAgent`, `DecideApproval`, `DelegateAgent`, `TransferSession`, `AdkComposer` | `AskAgentUseCase`, `DecideApprovalUseCase`, `DelegateAgentUseCase`, `TransferSessionUseCase`, `ComposeRuntimeUseCase` |
| Service | High-level API of one module. Each method does one thing. Loops and branches live here or in role collaborators. | `Service`; collaborators keep role names (`Loop`, `Projector`, `Executor`, `Gate`, `Codec`) | `SessionManager`, `ContextProjector`, `TurnLoop`, `ToolExecutor`, `ModelRunner`, five Nest scanners | `SessionService`, `ContextService`, `ToolService`, `ModelService`, `NestScanService` |
| Repository | Final destination: storage, network, fs, model provider. | `Storage`, `Source`, `Adapter`, `Transport` | `SessionStorage`, `ArtifactStorage`, `PricingSource`, `GeminiTransport` | Same names |

## Phase 2: RunContext and durable metadata

Replaces `SessionOwner` and gives every component one object to read from. Modeled on Google ADK's `InvocationContext` plus `session.state`.

- New `domain/run/run-context` (no runtime imports). Two parts:
  - durable, always the fold of the journal: `sessionId`, active agent, creating actor, `metadata`;
  - per invocation, dies at settle: `runId`, `actor`, `signal`, `startedAt`, `parent` (delegation), resolved model, catalog, limits, breaker, instructions. `RunScope` merges into this part.
- `RunMetadata` with `get`, `set`, `has`, `delete` and typed keys (`MetadataKey.of<string>("ownerId")`). Values restricted to JSON primitives and plain objects, size limit per key.
- New event `SessionMetadataSet(key, value)` and `SessionMetadataDeleted(key)`. Last write per key wins. Written on the turn's commit, so a failed run loses the write together with the turn.
- `SessionState.metadata` folded by `StateProjector`; bump `StateProjector.VERSION`.
- `createSession({ metadata })` and `ask({ metadata })` both append the events. `approve()` and `reject()` take nothing: the context is rebuilt from the session.
- Delegated run: child session receives a read-only copy at open, written as events in the child, so it rehydrates on its own.
- Every contract method takes the context as first parameter (`ArtifactStorage.put(context, content)`, `SessionStorage.append(context, command)`, notice sinks, `PricingSource`). Adapters ignore what they do not need. Journal keys stay `sessionId` internally.
- Services receive the context by parameter and never store it in a field. This is the rule that keeps the lib stateless.
- Remove `SessionOwner`, `Session.owner`, `AgentRunCommand.owner`, `RunScope.owner`. Events originated by a human (`UserMessage`, approval, rejection) carry `actorId`.
- `EventRedactor` covers metadata values.
- Contract suite in `@nestjs-adk/testing` builds contexts through a codec, never a domain constructor.
- Codecs for the new events; `StorageCodecs.standard()` updated.

## Phase 3: small safe contract fixes

- Delete `MeteredEmbedder`; `Embedder` gains an overridable `embedMetered` whose default returns `ModelUsage.none()`; `PricedEmbedder` drops the `instanceof`.
- Move `contracts/session-event-publisher.ts` to `runtime/event/`; it is not exported and has only internal implementations.
- `GeminiOptions.apiKey` becomes `Secret`.
- Wire `CompactionStrategy` through `RuntimeOptionsPatch`; stop hardcoding `OldestFirstCompactionStrategy` in `RuntimeFactory`.
- Make `OffloadPolicy`, `SnapshotPolicy` and `EventRedactor` abstract with today's classes as shipped defaults.
- Default `approvals` to `EffectApprovalPolicy.from(DESTRUCTIVE)`.
- `RunLimits`: document loudly that iterations are unbounded by default, or ship a raised ceiling.
- Invalidate `AttachmentReader` cache on session delete (folds into the `AttachmentCache` extraction of phase 6 if that lands first).
- `SessionStorage.findOrFail` becomes a non-abstract method on the base class.
- JSDoc on `AgentHandle.ask/inspect/approve/reject`: the lib never checks who owns a session; the application authorizes `sessionId` before calling.

## Phase 4: folder reorganization, move only

No renames in this phase, so the diff is readable.

- `contracts/` into six groups: `storage/`, `pricing/`, `context/`, `events/`, `tool/`, `model/`. No per-contract folders, no barrels.
- `adapters/storage/codec/` into one folder per codec holding codec, record and spec.
- `domain/event/` (56 files) and `domain/model/` (47 files) grouped by concept.
- Same rule applied to any folder over the 12-file alert.

## Phase 5: mechanical renaming

- Category suffixes on every file, with the tree-walking spec from phase 1 turned on.
- `static of()` → constructor or `from<Source>`; `ToolCallNotice.of(call, tool)` → `ToolCallNotice.fromCall`.
- The 120 `xxxOf`/`xxxFor` methods, module by module; `grep -rnE "\w+(Of|For)\("` over non-spec sources is the countdown. Examples: `ZodToolSchema.declarationOf` → `buildDeclaration`, `reasonOf` → `readRejectionReason`, `priceOf` → `calculatePrice`.
- Class renames from the layer table: `AdkRuntimeHost` → `AdkRuntime` (it imports nothing from Nest), `AdkComposer` → `ComposeRuntimeUseCase`, the four run use cases, the module services.

## Phase 6: push dirt inward, then split constructors

Order matters: constructor arity drops as a consequence of moving logic, not the other way round.

- `AskAgentUseCase.execute` ends with sequential awaits and no `if`: `ownerOf` → `SessionService.resolveActiveAgent`; `assertMediaSupported` → `ModelService`; the `try/finally` around `ToolSourceScope` → `ToolService.withSources`; the `transferTo` ternaries → `SessionOpener` returns session and agent together, or a separate `TransferAndAskUseCase`.
- `RuntimeFactory.create` split into `ContextComposer`, `RunComposer`, `SessionComposer`; drop the Wirely container from a method where every provider is already built.
- `RuntimeOptions` grouped into `context`, `cost`, `tools`, `lifecycle` sub-objects; `AgentDefinition.of`, `AskInput.with`, `AgentRunCommand` take input objects.
- `AdkComposer`'s five scanners become one `NestScanService`.
- `AdkAgent` exposes the handle instead of duplicating its 13 methods.
- Extract `AttachmentCache` from `AttachmentReader`; collapse `UnreachableArtifactStorage` and `UnwritableArtifactStorage` into one null object.
- Unify the three notice sinks as one `NoticeSink<T>` family; rename `ConsumerNoticeSink`.
- Add a same-model retry policy honoring `Retry-After`, distinct from failover.

## Phase 7: the path without Nest

- Export `DeclaredAgent`, `AskInput`, `AgentExecutionPolicies`, `SkillDefinition`.
- `createAdkRuntime({ agents, storage?, artifacts?, clock?, ids?, runtime?, exposed? })` with one defaults table shared with `AdkModule`.
- `AdkModule.forRoot` accepts a plain literal and applies `AdkModuleOptions.from` internally.
- README "Without NestJS" section rewritten against the real API.

## Phase 8: artifacts

- `read_artifact` gains `offset` and `limit`; default limit equals the offload threshold.
- `SqliteArtifactStorage` beside `SqliteSessionStorage`; boot refuses an in-memory artifact store when offload is on and more than one process is implied, or documents the loss loudly.
- `OffloadPolicy` decides how (inline, opaque, explorable) by media type, not only whether.
- New runtime `ArtifactExplorer` owning internal tools, all character-budgeted, no code execution, every result re-checked by the offload policy: `outline_artifact` (keys, types, array lengths to depth N), `search_artifact` (fixed string first; regex only with length limit and no nested quantifiers), `query_artifact` (JSON Pointer or a JSONPath subset without filters).
- `ArtifactStorage` stays bytes only.
- A real `ToolCallObserver` in the playground rendering the approval prompt, so HITL has a consumer-level implementation.

## Phase 9: comments

Last, after everything above has settled the names.

- Remove the 690 indented JSDoc blocks and the 181 line comments.
- Keep JSDoc only on exported public API, following `comments-and-jsdoc.md`.
- A guideline captures anything a removed comment explained that a future reader still needs.

**Phase 9 done.** Swept in three batches, each by a TypeScript-AST pass that stripped every
comment, followed by JSDoc rewritten from scratch on the public surface only. Comment lines across
the five packages fell from 8.363 to 1.855: core 6.710 to 1.413, google 274 to 43, openai 205 to
34, mcp 587 to 193, testing 587 to 172. Line comments are down to ten magic values in the core's
domain and common, plus the export-group labels in `packages/core/src/index.ts`; member JSDoc is
down to ten blocks on the contracts an application implements.
`packages/core/src/comment-sweep.spec.ts` asserts both, so a new comment is a failing test rather
than a review finding, and `comments-and-jsdoc.md` has dropped `status: target`.

## Phase 10, optional: module-first tree

Reorganize from layer-first (`domain/session`, `runtime/session`, `adapters/storage`) to module-first (`session/`, `tool/`, `model/`, each holding its own layers with category suffixes), as ADR 0018 does. Highest cost, decided separately.
