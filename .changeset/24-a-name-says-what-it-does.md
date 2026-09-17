---
"@nestjs-adk/core": major
"@nestjs-adk/google": major
"@nestjs-adk/openai": major
"@nestjs-adk/mcp": major
"@nestjs-adk/testing": major
---

A name says what it does.

Every file now declares its category in its suffix (`session-storage.contract.ts`, `ask-agent.use-case.ts`, `agent-name.value-object.ts`), and a spec fails the build when a file has none.

Static `of()` factories are gone. A class that converts or validates names its source: `AgentName.from`, `Actor.fromId`, `ToolCallNotice.fromCall`, `ZodToolSchema.fromSchema`. A class that only holds what it was given takes it in the constructor: `new RunLimits(...)`, `new ModelIdentity(...)`, `new Secret(...)`.

Methods start with a verb and never end in `Of` or `For`: `PricingSource.findPrice`, `ZodToolSchema.buildDeclaration`, `ToolMetadata.readEffect`.

Classes are named by their layer: `AdkRuntimeHost` is `AdkRuntime`; `AdkComposer`, `AskAgent`, `DecideApproval`, `DelegateAgent`, `CreateSession`, `InspectSession` and `AgentSwitch` are `*UseCase` classes with a single `execute`; `ContextManager` is `ContextService`; `SessionManager` is `SessionRepository`.
