# @nestjs-adk/google

**Gemini for [nestjs-adk](https://www.npmjs.com/package/@nestjs-adk/core).**

One model class and one embedder, both of them plain values you construct and hand to the module. Nothing here is a NestJS provider and nothing is registered: `GeminiModel` is an `LlmModel`, so wherever the core takes a model, this goes.

```bash
npm i @nestjs-adk/core @nestjs-adk/google
```

## The model

```ts
import { AdkModule, AdkModuleOptions } from "@nestjs-adk/core";
import { GeminiModel } from "@nestjs-adk/google";

const flash = new GeminiModel("gemini-3.5-flash-lite", {
	apiKey: process.env.GEMINI_API_KEY,
	temperature: 0.2,
	maxOutputTokens: 512,
});

@Module({ imports: [AdkModule.forRoot(AdkModuleOptions.from({ defaultModel: flash }))] })
export class AppModule {}
```

The same object goes anywhere a model goes: `defaultModel`, `@Agent({ model })`, a failover chain, or the summarizer a compaction policy uses.

`apiKey` defaults to `GOOGLE_API_KEY` or `GEMINI_API_KEY` from the environment. The generation parameters are typed fields, so a typo fails to compile: `temperature`, `topP`, `topK`, `maxOutputTokens`, `stopSequences`, `frequencyPenalty`, `presencePenalty`. Anything this adapter does not model goes through `config`, which is where `safetySettings` and `thinkingConfig` live, and a typed field always wins over the same key inside `config`.

```ts
new GeminiModel("gemini-3.5-flash-lite", {
	apiKey,
	config: { thinkingConfig: { thinkingLevel: "low" } },
});
```

## Vertex AI

Set `vertexai` and the adapter talks to Vertex instead of the Gemini API. `project` and `location` are required there, and `apiKey` is ignored in favour of the ambient credentials:

```ts
new GeminiModel("gemini-3.5-pro", {
	vertexai: true,
	project: "nebula-prod",
	location: "us-central1",
	labels: { team: "support" },
});
```

`labels` are for cost attribution and Vertex only; the Gemini API ignores them. `cachedContent` takes the handle of a cached content entry created outside this adapter.

## The context window

The runtime measures compaction against the window the model declares, so the adapter reports what it knows. When it cannot know, say so rather than letting it guess:

```ts
new GeminiModel("gemini-3.5-flash-lite", { contextWindowTokens: 1_000_000, reservedOutputTokens: 8_000 });
```

`reservedOutputTokens` is held back out of the declared window for the answer. Without `contextWindowTokens` the model reports an unknown window, which the core reports through its context notice sink instead of compacting on a number nobody verified.

## Embeddings

`GeminiEmbedder` implements the core's `Embedder` port:

```ts
import { GeminiEmbedder } from "@nestjs-adk/google";

AdkModule.forRoot(
	AdkModuleOptions.from({
		defaultModel: flash,
		embedder: new GeminiEmbedder("gemini-embedding-2", { apiKey }),
	}),
);
```

```ts
@Injectable()
export class SearchService {
	public constructor(private readonly embedder: Embedder) {}
}
```

`outputDimensionality` truncates the vector, and `taskType` tells Google what the vector is for, which changes the embedding it produces. Google's `embedContent` does not report token usage, so an embedding priced through `PricedEmbedder` lands in `cost.unpriced` with a notice rather than having its tokens guessed from characters.

## Failures, and how failover reads them

The adapter never lets a Google error reach the runtime. `GeminiFailureMapper` turns each one into a `ModelFailure` the core declares, and that classification is what a failover policy decides on:

| What Google answered | What the core sees |
| --- | --- |
| 429, quota exhausted | `RateLimitedFailure` |
| deadline exceeded, socket timeout | `TimeoutFailure` |
| 500, 503, connection refused | `UnavailableFailure` |
| prompt over the model's window | `ContextExceededFailure` |
| a safety filter stopped the answer | `SafetyBlockedFailure` |
| a schema it will not take, a bad key, a model that does not exist | `InvalidRequestFailure` |
| anything it cannot place | `UnknownFailure` |

Only the first three answer `isTransient`. A refused request is the one failure a chain must not answer by trying the next model, since every model in the chain is sent the same thing, and `SequentialFailoverPolicy` stops on it.

Two errors are this package's own, thrown rather than mapped, because they are a schema this adapter cannot send at all: `InvalidJsonSchemaError` and `EmptyEmbeddingError`. Both extend `AdkError` and carry a stable `code`, and each documents itself in its own JSDoc.

## Your own transport

Every call goes through `GenAiTransport`, which is the one seam between this adapter and Google's SDK. Replace it to route through a proxy, to record traffic, or to test without a network:

```ts
const recorded = new GeminiModel("gemini-3.5-flash-lite", { apiKey }, new RecordingTransport());
```

The mappers are exported for the same reason: `GeminiRequestMapper` turns a core `ModelRequest` into `GeminiRequest`, `GeminiStreamMapper` turns each `GeminiResponseChunk` back into a `ModelChunk`, and `GeminiFailureMapper` does the table above. Use them when you are building something adjacent; you do not need any of them to use the model.

## API reference

| Symbol | What it is for |
| --- | --- |
| `GeminiModel` | The model. Construct it and hand it to the core |
| `GeminiOptions` | Everything it takes: key, Vertex, generation parameters, window, `config` |
| `GeminiEmbedder`, `GeminiEmbeddingOptions` | The `Embedder` implementation and its options |
| `GenAiTransport`, `GeminiTransport` | The one call this adapter makes, and the port behind it |
| `GenAiClientFactory`, `GenAiClient`, `GenAiEmbeddingClient` | How the SDK client is built and what the adapter needs from it |
| `GeminiRequestMapper`, `GeminiRequest` | A core request as Google receives it |
| `GeminiStreamMapper`, `GeminiResponseChunk` | Google's stream as core chunks |
| `GeminiFailureMapper` | A Google error as a `ModelFailure` |
| `InvalidJsonSchemaError`, `EmptyEmbeddingError` | This package's own errors, both `AdkError` |

## Learn more

The full project lives at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).
