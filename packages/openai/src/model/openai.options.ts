import type { Secret } from "@nestjs-adk/core";

/**
 * Everything `OpenAiModel` takes besides the model name: the key, the `baseURL` that points at
 * another OpenAI-compatible provider, transport settings, the generation parameters, and the
 * context window, which the adapter cannot discover on its own.
 *
 * `body` is merged into the request untouched, for a field this interface does not name.
 * `apiKey` is best given as a `Secret` so it does not surface in logs.
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

	body?: Record<string, unknown>;
}
