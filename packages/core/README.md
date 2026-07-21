# @nestjs-adk/core

Core do [nestjs-adk](../../README.md): decorators (`@Agent`, `@Tool`, `@Skill`, `@Prompt`, `@WorkflowAgent`, `@InjectAgent`), contratos abstratos (`AdkEngine`, `SessionStore`, `ArtifactStore`, `ToolsetResolver`), `AdkModule`, `AgentRunner`/`AgentRef`, model specs (`gemini()`, `openaiLike()`, `modelRouter()`), structured output e Continuity (offload automático, compaction, HITL).

Agnóstico de engine — use com [`@nestjs-adk/google`](../google).

```bash
npm i @nestjs-adk/core @nestjs-adk/google
```

Documentação completa: [API.md](../../API.md).
