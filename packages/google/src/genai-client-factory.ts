import { GoogleGenAI } from "@google/genai";
import type { GeminiOptions } from "./gemini-options";
import type { GenAiClient, GenAiEmbeddingClient } from "./genai-client";

/**
 * Builds the official client from the options, and is the only place that imports the SDK.
 *
 * One interface serves both surfaces: `vertexai: true` with a project and a location
 * reaches Vertex AI, anything else reaches the Gemini API. Nothing else about the
 * adapter changes between them, which is why there is one mapper and not two.
 */
export class GenAiClientFactory {
	public create(options: GeminiOptions): GenAiClient {
		return this.client(options);
	}

	/** The same client, narrowed to the single call an embedder makes. */
	public embeddings(options: GeminiOptions): GenAiEmbeddingClient {
		return this.client(options);
	}

	private client(options: GeminiOptions): GoogleGenAI {
		if (options.vertexai === true) {
			return new GoogleGenAI({ vertexai: true, project: options.project, location: options.location });
		}
		return new GoogleGenAI({ apiKey: options.apiKey });
	}
}
