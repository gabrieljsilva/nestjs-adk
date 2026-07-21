# @nestjs-adk/google

Engine adapter do Google ADK para o [nestjs-adk](../../README.md): traduz os decorators em `LlmAgent`/`FunctionTool` **nativos** do `@google/adk` em runtime — todo o ecossistema ADK continua funcionando (incluindo `adk web` via `createAdkEntry`).

```ts
AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: "gemini-2.5-flash" })
```

Suporta `gemini()` (Vertex/AI Studio, labels, cachedContent), `openaiLike()` (via adk-llm-bridge), `modelRouter()` (failover → RoutedLlm nativo) e compaction nativa.
