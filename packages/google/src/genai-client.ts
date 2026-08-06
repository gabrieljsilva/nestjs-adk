import type {
	CountTokensParameters,
	CountTokensResponse,
	EmbedContentParameters,
	EmbedContentResponse,
	GenerateContentParameters,
} from "@google/genai";
import type { GeminiResponseChunk } from "./gemini-stream-mapper";

/**
 * The two things this adapter needs from a Gemini client.
 *
 * The official client satisfies it structurally, so nothing is asserted, and a test can
 * satisfy it with an object that yields the chunks a spec cares about.
 */
export interface GenAiClient {
	models: {
		generateContentStream(params: GenerateContentParameters): Promise<AsyncIterable<GeminiResponseChunk>>;
		countTokens(params: CountTokensParameters): Promise<CountTokensResponse>;
	};
}

/**
 * The one thing an embedder needs, kept apart from what a model needs.
 *
 * Embedding and generating are different models behind the same client, and a fake that
 * answers a stream has no business declaring `embedContent`. The official client
 * satisfies both, so the split costs nothing at the call site.
 */
export interface GenAiEmbeddingClient {
	models: {
		embedContent(params: EmbedContentParameters): Promise<EmbedContentResponse>;
	};
}
