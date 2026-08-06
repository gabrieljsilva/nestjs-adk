# @nestjs-adk/openai

OpenAI models for [nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk), over the official SDK.

```bash
npm i @nestjs-adk/core @nestjs-adk/openai
```

## Declaring a model

```ts
import { OpenAiModel } from "@nestjs-adk/openai";

const gpt = new OpenAiModel("gpt-5", { apiKey: process.env.OPENAI_API_KEY });
```

The key falls back to `OPENAI_API_KEY` when you leave it out.

## Any OpenAI compatible API

`baseURL` is the whole of the change. OpenRouter, Ollama, Groq, Together and vLLM all
speak Chat Completions, so pointing the client elsewhere is enough:

```ts
const local = new OpenAiModel("llama3", {
	baseURL: "http://localhost:11434/v1",
	apiKey: "ollama",
});

const routed = new OpenAiModel("anthropic/claude-sonnet-4", {
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: process.env.OPENROUTER_API_KEY,
	headers: { "HTTP-Referer": "https://your.app" },
});
```

## Context window

The adapter does not guess one. OpenAI publishes no endpoint for it and the numbers
change release by release, so state it when you know it:

```ts
new OpenAiModel("gpt-5", { contextWindowTokens: 400_000, reservedOutputTokens: 32_000 });
```

Without it the model reports an unknown window: the runtime still measures every part
of the context and reports the unknown window once, and nothing is silently truncated.

## Generation options

```ts
new OpenAiModel("gpt-5", {
	temperature: 0.2,
	topP: 0.9,
	maxOutputTokens: 2000,
	stopSequences: ["END"],
	body: { seed: 7 },
});
```

`body` is a passthrough for fields this adapter does not model, such as gateway
specific extensions. Typed options win over it.

Reasoning models are configured through it, and one of them needs it: `gpt-5.6-luna`
answers 400 to any request declaring function tools while a reasoning effort is set. An
agent with tools runs on `body: { reasoning_effort: "none" }`.

## Structured output

A schema reaches the API as a `json_schema` response format with `strict: true`, which
is what makes the provider enforce the shape instead of suggesting it. Strict mode
accepts a subset of JSON Schema: every object closed with `additionalProperties: false`,
and every property it declares listed in `required`.

```ts
{
	type: "object",
	properties: { score: { type: "number" }, reason: { type: "string" } },
	required: ["score", "reason"],
	additionalProperties: false,
}
```

Anything else is refused before the request is sent, with `NonStrictJsonSchemaError`
naming the object and what it lacks. Sent as it is, it comes back as a 400 about a
request nobody wrote by hand.

## License

MIT
