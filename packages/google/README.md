# @nestjs-adk/google

The Google ADK engine for [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core).

The core package defines how you write agents. This package makes them run. At runtime it translates your decorated NestJS classes into native objects from the [Google ADK](https://google.github.io/adk-docs/), so you get Google's production agent loop, tool calling, streaming and OpenTelemetry tracing, while your code stays pure NestJS.

## Setup

```bash
npm i @nestjs-adk/core @nestjs-adk/google
```

Pass the engine to the module and you are done:

```ts
import { AdkModule } from "@nestjs-adk/core";
import { GoogleAdkEngine } from "@nestjs-adk/google";

AdkModule.forRoot({
	engine: GoogleAdkEngine,
	defaultModel: "gemini-2.5-flash",
})
```

Authentication follows the ADK rules: set `GEMINI_API_KEY` in the environment for the Gemini API, or use Vertex AI credentials.

## The Gemini model spec

For simple cases a model string is enough. When you need Google specific options, use the `Gemini` class exported by this package:

```ts
import { Gemini } from "@nestjs-adk/google";

defaultModel: new Gemini("gemini-2.5-flash", {
	vertexai: true,
	project: "my-project",
	location: "us-central1",
	temperature: 0.2,
	stopSequences: ["END"],
	labels: { team: "growth" },
	cache: { content: "cachedContents/abc" },
	config: { thinkingConfig: { thinkingBudget: 0 } },
})
```

Generation parameters (`temperature`, `topP`, `topK`, `maxOutputTokens`, the penalties and `stopSequences`) are first-class typed fields. `labels` are attached to every request for billing and cost tracking on Vertex. `cache` points the requests at an explicit cached content entry, and the cached token count then shows up in `run.usage.cachedTokens`. `config` remains a free passthrough of `GenerateContentConfig` for everything else, like thinking budgets and safety settings — when a parameter appears both typed and inside `config`, the typed field wins.

The spec's configuration follows the spec everywhere: directly on an agent, as a `ModelRouter` target (each target keeps its own temperature and labels) and as the compaction summarizer.

## Failover with ModelRouter

The `ModelRouter` spec from the core runs here on top of the ADK's native routed model:

```ts
defaultModel: new ModelRouter({
	targets: {
		primary: new Gemini("gemini-2.5-flash"),
		fallback: new OpenAiLike("gpt-4o-mini", { baseUrl: "https://openrouter.ai/api/v1" }),
	},
})
```

When the current target fails before the first chunk of the response, the router moves to the next target in order and the run continues. Every switch is emitted as a `model_rerouted` event and logged as a warning.

`OpenAiLike` targets are materialized through the adk-llm-bridge, which lets you mix Gemini with any provider that speaks the OpenAI API.

## Native compaction

When an agent declares a compaction policy (`context: contextPolicy({ compaction: ... })`), this engine applies it with the ADK's native context compactors and an LLM summarizer. Old turns are summarized when the history passes the token threshold, and recent turns are kept whole.

The summarizer is a real model call, so it is not free: its tokens join `run.usage` and, with pricing configured in the core, it is billed under the summarizer's own model, on its own line in `run.cost.byModel`. Compaction is skipped during `explain()`, since the compactor runs before the model call is short-circuited and a dry run must not bill anything.

## Capturing the context

With `forRoot({ diagnostics: true })`, this engine records what every model call actually received. Capture sits at the point where the final request is assembled, so it works the same for a plain model id, a `Gemini` spec, an OpenAI-compatible endpoint, a `ModelRouter` target or a custom `AdkModel` — it is not tied to the scripted path.

The engine also implements `explain()`: it builds the request through the real native pipeline, including the ADK's own request processors and the hydrated history, then short-circuits before the provider. Serialization keeps the payload as it is, insertion order included, because that is what the provider caches on. See the testing package for the matchers that consume this.

## Using the ADK Dev UI

Google ships a web interface for inspecting agents, called `adk web`. Your NestJS agents can appear there through `createAdkEntry`:

```ts
// adk-agents/support/agent.mjs
export const rootAgent = await createAdkEntry(AppModule, SupportAgent);
```

`createAdkEntry` boots your Nest application context, resolves the agent with full dependency injection and returns the native `LlmAgent` that the Dev UI consumes. You get chat, event inspection and tool call traces over your real agents. See the playground in the main repository for a complete working setup.

## Learn more

The full documentation lives in [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core) and in the repository at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).
