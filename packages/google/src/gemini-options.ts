/**
 * How to reach Gemini, and how to generate once there.
 *
 * The same options serve both surfaces. `vertexai: true` with a project and a location
 * talks to Vertex AI; without it, to the Gemini API. That is the whole of the
 * difference, because `@google/genai` speaks to both through one interface.
 */
export interface GeminiOptions {
	/** Defaults to the value of `GOOGLE_API_KEY` or `GEMINI_API_KEY`. Ignored on Vertex AI. */
	apiKey?: string;

	/** Talk to Vertex AI instead of the Gemini API. */
	vertexai?: boolean;

	/** Required on Vertex AI. */
	project?: string;

	/** Required on Vertex AI, for example `us-central1`. */
	location?: string;

	/** Billing labels for cost attribution. Vertex AI only; the Gemini API ignores them. */
	labels?: Record<string, string>;

	/** Handle of a cached content entry created outside this adapter. */
	cachedContent?: string;

	temperature?: number;
	topP?: number;
	topK?: number;
	maxOutputTokens?: number;
	stopSequences?: string[];
	frequencyPenalty?: number;
	presencePenalty?: number;

	/** How many tokens the window holds, when the caller knows and the adapter cannot. */
	contextWindowTokens?: number;

	/** Held back for the answer out of the declared window. */
	reservedOutputTokens?: number;

	/** Passthrough for config fields this adapter does not model, such as `safetySettings` or `thinkingConfig`. Typed fields win. */
	config?: Record<string, unknown>;
}
