import type { Secret } from "@nestjs-adk/core";

/**
 * Everything `OpenAiModel` takes besides the model name: the key, the `baseURL` that points at
 * another OpenAI-compatible provider, transport settings, the generation parameters, and the
 * context window, which the adapter cannot discover on its own.
 *
 * `body` is merged into the request untouched, for a field this interface does not name.
 * `apiKey` is best given as a `Secret` so it does not surface in logs.
 *
 * `capabilities` says what the endpoint behind `baseURL` can do. Left out, the adapter assumes
 * the official API: images in and fetched by URL. A compatible endpoint without vision says
 * `{ mediaInput: false }`, so an image is refused here instead of by a provider already paid.
 */
export interface OpenAiOptions {
	apiKey?: Secret | string;

	baseURL?: string;

	organization?: string;

	headers?: Record<string, string>;

	timeoutMs?: number;

	temperature?: number;
	topP?: number;
	maxOutputTokens?: number;
	stopSequences?: string[];
	frequencyPenalty?: number;
	presencePenalty?: number;

	contextWindowTokens?: number;

	reservedOutputTokens?: number;

	replaysReasoning?: boolean;

	capabilities?: OpenAiCapabilities;

	body?: Record<string, unknown>;
}

/** What the model behind the endpoint accepts; anything left out keeps the official API's answer. */
export interface OpenAiCapabilities {
	mediaInput?: boolean;
	mediaUrl?: boolean;
}
