/**
 * How to reach an OpenAI compatible API, and how to generate once there.
 *
 * `baseURL` is what makes this adapter work against OpenRouter, Ollama, Groq, Together
 * or vLLM: they all speak Chat Completions, so pointing the client elsewhere is the
 * whole of the change. Leaving it out talks to the official API.
 */
export interface OpenAiOptions {
	/** Defaults to the value of `OPENAI_API_KEY`. */
	apiKey?: string;

	/** Defaults to the official OpenAI endpoint. */
	baseURL?: string;

	organization?: string;

	/** Extra headers on every request, which is how some gateways route or attribute usage. */
	headers?: Record<string, string>;

	/** How long one request may take, in milliseconds. */
	timeoutMs?: number;

	temperature?: number;
	topP?: number;
	maxOutputTokens?: number;
	stopSequences?: string[];
	frequencyPenalty?: number;
	presencePenalty?: number;

	/** How many tokens the window holds, when the caller knows and the adapter cannot. */
	contextWindowTokens?: number;

	/** Held back for the answer out of the declared window. */
	reservedOutputTokens?: number;

	/** Passthrough for body fields this adapter does not model; typed fields win over it. */
	body?: Record<string, unknown>;
}
