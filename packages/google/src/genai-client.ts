import type { CountTokensParameters, CountTokensResponse, GenerateContentParameters } from "@google/genai";
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
