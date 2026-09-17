import type { Secret } from "@nestjs-adk/core";

/**
 * Everything `GeminiModel` takes besides the model name: credentials, either an API key or
 * Vertex AI with `project` and `location`, the generation parameters Gemini accepts, and the
 * context window, which the adapter cannot discover on its own.
 *
 * `config` is passed to Google's SDK untouched, for a field this interface does not name.
 * `apiKey` is best given as a `Secret` so it does not surface in logs.
 */
export interface GeminiOptions {
	apiKey?: Secret | string;

	vertexai?: boolean;

	project?: string;

	location?: string;

	labels?: Record<string, string>;

	cachedContent?: string;

	temperature?: number;
	topP?: number;
	topK?: number;
	maxOutputTokens?: number;
	stopSequences?: string[];
	frequencyPenalty?: number;
	presencePenalty?: number;

	contextWindowTokens?: number;

	reservedOutputTokens?: number;

	config?: Record<string, unknown>;
}
