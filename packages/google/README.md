# @nestjs-adk/google

Google ADK engine adapter for [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core) — translates your decorated NestJS agents into **native** `@google/adk` objects (`LlmAgent`/`FunctionTool`) at runtime, so the whole ADK ecosystem keeps working (including `adk web` via `createAdkEntry`).

```ts
AdkModule.forRoot({
	engine: GoogleAdkEngine,
	defaultModel: new Gemini("gemini-2.5-flash", { labels, cache, config }),
})
```

Includes: the canonical `Gemini` model spec (Vertex/AI Studio, billing labels, explicit cachedContent), `OpenAiLike` via adk-llm-bridge, `ModelRouter` failover via the ADK's native `RoutedLlm` (with `model_rerouted` events), native context compaction and cached-token usage reporting.

Full documentation: [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk)
