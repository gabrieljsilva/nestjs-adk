import type {
	CountTokensParameters,
	CountTokensResponse,
	EmbedContentParameters,
	EmbedContentResponse,
	GenerateContentParameters,
} from "@google/genai";
import type { GeminiResponseChunk } from "../mapping/gemini-stream.mapper";

export interface GenAiClient {
	models: {
		generateContentStream(params: GenerateContentParameters): Promise<AsyncIterable<GeminiResponseChunk>>;
		countTokens(params: CountTokensParameters): Promise<CountTokensResponse>;
	};
}

export interface GenAiEmbeddingClient {
	models: {
		embedContent(params: EmbedContentParameters): Promise<EmbedContentResponse>;
	};
}
