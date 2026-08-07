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

Generation parameters (`temperature`, `topP`, `topK`, `maxOutputTokens`, the penalties and `stopSequences`) are first-class typed fields. `labels` are attached to every request for billing and cost tracking on Vertex. `cache` points the requests at an explicit cached content entry, and the cached token count then shows up in `run.usage.cachedTokens`. `config` remains a free passthrough of `GenerateContentConfig` for everything else, like thinking budgets and safety settings. When a parameter appears both typed and inside `config`, the typed field wins.

The spec's configuration follows the spec everywhere: directly on an agent, as a failover target (each target keeps its own temperature and labels) and as the compaction summarizer.

## Failover

The `failover` declared on a model spec (see the core documentation) is executed here by the lib's own `FailoverLlm`, not by the ADK. Each attempt receives the request naming that attempt's own model, by construction, so the provider is always asked for a real model id.

```ts
defaultModel: new Gemini("gemini-2.5-flash", {
	failover: [new OpenAiLike("gpt-4o-mini", { baseUrl: "https://openrouter.ai/api/v1" })],
})
```

When the current model fails before the first chunk of the response, the chain advances and the run continues. Every switch is emitted as a `model_rerouted` event and logged as a warning. `httpStatusOf()` is exported for failover policies that branch on the provider's HTTP status.

Other providers live in their own packages: this one is Gemini and Vertex AI, and nothing here knows another provider exists.

## A conversation that arrives from another provider

Gemini 3 signs the function calls it generates and refuses a turn whose calls come back unsigned. A conversation reaches Gemini already holding calls written elsewhere in three ways: a transfer into an agent that runs here, a resolver routing one hop here, and a failover that reroutes a turn to a Gemini model after another provider declined it. All three used to end in a 400 naming a tool.

This adapter fills a call it cannot sign with `skip_thought_signature_validator`, the placeholder Google documents for "transferring a trace from a different model that does not include thought signatures". It applies to the turn being answered, to the call that opens each step, and never to a signature the provider itself gave.

Google discourages synthesised call blocks and warns that the model reasons worse without the real signature. The trade is a possibly weaker answer instead of a dead run, and it is only made for a handover the application never asked about. A conversation that stays on one Gemini model is untouched.

## Tool declarations from external catalogs

A tool from an MCP server keeps the JSON Schema the server published, and this engine filters it down to what Gemini's declaration surface accepts (`toGeminiSchema()`, exported). It is a filter, not a translator: `anyOf`, `format`, `pattern` and friends survive verbatim; keywords the API refuses are dropped; `$ref` is inlined; and an array without `items` is repaired, because one broken declaration would otherwise answer 400 for the whole turn. Declared (`@Tool`) tools are unaffected: their Zod schema is handed to the ADK as before.

## Native compaction

When an agent declares a compaction policy (`context: contextPolicy({ compaction: ... })`), this engine applies it with the ADK's native context compactors and an LLM summarizer. Old turns are summarized when the history passes the token threshold, and recent turns are kept whole.

The summarizer is a real model call, so it is not free: its tokens join `run.usage` and, with pricing configured in the core, it is billed under the summarizer's own model, on its own line in `run.cost.byModel`. Compaction is skipped during `explain()`, since the compactor runs before the model call is short-circuited and a dry run must not bill anything.

## Capturing the context

With `forRoot({ diagnostics: true })`, this engine records what every model call actually received. Capture sits at the point where the final request is assembled, so it works the same for a plain model id, a `Gemini` spec, an OpenAI-compatible endpoint, a failover target or a custom `AdkModel`. It is not tied to the scripted path.

The engine also implements `explain()`: it builds the request through the real native pipeline, including the ADK's own request processors and the hydrated history, then short-circuits before the provider. Serialization keeps the payload as it is, insertion order included, because that is what the provider caches on. See the testing package for the matchers that consume this.

## Learn more

The full documentation lives in [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core) and in the repository at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).
