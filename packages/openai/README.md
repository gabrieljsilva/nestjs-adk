# @nestjs-adk/openai

**The OpenAI chat completions API for [nestjs-adk](https://www.npmjs.com/package/@nestjs-adk/core).**

One model class, and it covers more than OpenAI. Anything that speaks the chat completions API answers here through `baseURL`: OpenRouter, Groq, Together, Ollama, vLLM, a gateway of your own.

```bash
npm i @nestjs-adk/core @nestjs-adk/openai
```

## The model

```ts
import { AdkModule, AdkModuleOptions } from "@nestjs-adk/core";
import { OpenAiModel } from "@nestjs-adk/openai";

const luna = new OpenAiModel("gpt-5.6-luna", {
	apiKey: process.env.OPENAI_API_KEY,
	maxOutputTokens: 512,
});

@Module({ imports: [AdkModule.forRoot(AdkModuleOptions.from({ defaultModel: luna }))] })
export class AppModule {}
```

`OpenAiModel` is an `LlmModel`, so the same object goes anywhere a model goes: `defaultModel`, `@Agent({ model })`, a failover chain, or a compaction summarizer.

`apiKey` defaults to `OPENAI_API_KEY`. The generation parameters are typed fields, so a typo fails to compile: `temperature`, `topP`, `maxOutputTokens`, `stopSequences`, `frequencyPenalty`, `presencePenalty`. `organization`, `headers` and `timeoutMs` cover the transport side, and `headers` is how some gateways route or attribute usage.

Anything this adapter does not model goes through `body`, and a typed field always wins over the same key inside it:

```ts
new OpenAiModel("gpt-5.6-luna", { apiKey, body: { reasoning_effort: "none" } });
```

That escape hatch is what makes reasoning models usable without this package tracking each one's parameters.

## Another provider, same class

```ts
new OpenAiModel("meta-llama/llama-4-70b", {
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: process.env.OPENROUTER_API_KEY,
	headers: { "HTTP-Referer": "https://nebula.games" },
});

new OpenAiModel("qwen3", { baseURL: "http://localhost:11434/v1", apiKey: "ollama" });
```

Nothing else changes: tools, streaming, sessions, approvals and cost all work the same, because the runtime only ever sees an `LlmModel`.

## The context window

The runtime measures compaction against the window the model declares. A gateway serving somebody else's weights cannot be asked, so tell the adapter when you know:

```ts
new OpenAiModel("qwen3", { baseURL, apiKey, contextWindowTokens: 128_000, reservedOutputTokens: 4_000 });
```

Without `contextWindowTokens` the model reports an unknown window, which the core reports through its context notice sink rather than compacting on a number nobody verified.

## Structured output

`StrictSchemaValidator` checks a JSON Schema against what OpenAI's strict mode accepts before a request is sent, and throws `NonStrictJsonSchemaError` naming what is wrong. A schema OpenAI would refuse is worth catching locally rather than paying a round trip to be told.

## Failures, and how failover reads them

The adapter never lets a provider error reach the runtime. `OpenAiFailureMapper` turns each one into a `ModelFailure` the core declares, and that classification is what a failover policy decides on:

| What the provider answered | What the core sees |
| --- | --- |
| a context length code | `ContextExceededFailure` |
| a content filter code or type | `SafetyBlockedFailure` |
| 429 | `RateLimitedFailure` |
| 408, or a timeout code | `TimeoutFailure` |
| 5xx, or no status with a connection error | `UnavailableFailure` |
| any other 4xx | `InvalidRequestFailure` |
| anything it cannot place | `UnknownFailure` |

Only rate limits, timeouts and an unavailable provider answer `isTransient`. A refused request is the one failure a chain must not answer by trying the next model, since every model in the chain is sent the same thing, and `SequentialFailoverPolicy` stops on it. A 4xx that is none of the recognised cases is classified as a refused request rather than left unknown: left unknown it reads like the provider had a bad day, and a chain would pay for every model in it to be told the same thing.

Both of this package's own errors, `InvalidJsonSchemaError` and `NonStrictJsonSchemaError`, extend `AdkError` and carry a stable `code`. Each documents itself in its own JSDoc.

## Your own transport

Every call goes through `OpenAiTransport`. `SdkOpenAiTransport` is the default and uses the official SDK; replace it to route through a proxy, to record traffic, or to test without a network:

```ts
const recorded = new OpenAiModel("gpt-5.6-luna", { apiKey }, new RecordingTransport());
```

The mappers are exported for the same reason: `OpenAiRequestMapper` turns a core `ModelRequest` into `OpenAiChatRequest`, and `OpenAiStreamMapper` turns each `OpenAiStreamChunk` back into a `ModelChunk`. Use them when you are building something adjacent; you do not need any of them to use the model.

## API reference

| Symbol | What it is for |
| --- | --- |
| `OpenAiModel` | The model. Construct it and hand it to the core |
| `OpenAiOptions` | Everything it takes: key, `baseURL`, generation parameters, window, `body` |
| `OpenAiTransport`, `SdkOpenAiTransport` | The one call this adapter makes, and the SDK implementation of it |
| `OpenAiClientFactory`, `OpenAiChatClient` | How the client is built and what the adapter needs from it |
| `OpenAiRequestMapper`, `OpenAiChatRequest` | A core request as the provider receives it |
| `OpenAiStreamMapper`, `OpenAiStreamChunk` | The provider's stream as core chunks |
| `OpenAiFailureMapper` | A provider error as a `ModelFailure` |
| `StrictSchemaValidator` | Refuses a schema OpenAI's strict mode would refuse, before sending it |
| `InvalidJsonSchemaError`, `NonStrictJsonSchemaError` | This package's own errors, both `AdkError` |

## Learn more

The full project lives at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).
