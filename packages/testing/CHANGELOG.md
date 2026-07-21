# @nestjs-adk/testing

## 1.0.0

### Minor Changes

- 84cd3b8: Typed agent state and loop limits.

  - `state` on `@Agent`: a Zod schema validated at run entry (ask() and store hydration, before any model call) and on every write to a declared key (`ctx.state.set` / `outputKey`). Undeclared keys pass through. New `AgentStateInvalidError` and `AgentStateMissingError`.
  - `StateBag<TState>` and `ToolContext<TState>` generics (default keeps current behavior) plus `ctx.state.require(key)` for mandatory reads.
  - Opt-in loop caps: `maxIterations` (model/tool round trips per run) and `maxConsecutiveToolFailures` (per-tool circuit breaker, a success resets). Resolution: `ask()` override > `@Agent` > `forRoot({ defaults })`. Exceeding aborts the engine via signal and throws `AgentMaxIterationsError` (with aggregated usage and last requested tool) or `ToolRepeatedFailureError`.
  - Run logs: aborts always log as warn with duration and usage; breaker escalation logs at debug level.
  - Google engine: tool-call-only turns now emit `llm_response` (no text) carrying usage, so loop cost is aggregated correctly.

### Patch Changes

- Updated dependencies [84cd3b8]
  - @nestjs-adk/core@1.0.0

## 0.0.3

### Patch Changes

- 3928827: Rewritten documentation: each package now ships a complete, linear README in simple English, with the main guide living in @nestjs-adk/core.
- Updated dependencies [3928827]
  - @nestjs-adk/core@0.0.3

## 0.0.2

### Patch Changes

- English package READMEs, dependency security upgrades (npm audit clean) and vitest 4 compatibility for caller-relative prompt paths.
- Updated dependencies
  - @nestjs-adk/core@0.0.2

## 0.0.1

### Patch Changes

- Primeira versão: decorators (@Agent/@Tool/@Skill/@WorkflowAgent) com registro via providers do Nest (a instância é o handle: ask/stream/approve/reject), AdkModule com discovery fail-fast, prompts (string, AdkPrompt builder ou promptFile), modelos como classes (Gemini/OpenAiLike/ModelRouter com failover), structured output validado, Continuity (offload automático, compaction nativa, HITL approve/reject), embeddings (Embedder + Similarity), logs por nível com tokens I/O/C, MCP client e pacote de testing (TestAgent, ScriptedEngine/ScriptedModel, matchers, judge).
- Updated dependencies
  - @nestjs-adk/core@0.0.1
