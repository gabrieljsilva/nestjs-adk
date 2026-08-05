import type { ModelChunk, TokenCount } from "@nestjs-adk/core";
import type { GeminiRequest } from "./gemini-request";

/**
 * What actually talks to Gemini.
 *
 * It exists as a port so the adapter can be driven in a test without the SDK, without
 * a network and without a key. Unlike most providers, Gemini does count tokens before
 * the fact, so counting is part of the port rather than an estimate in the model.
 */
export abstract class GeminiTransport {
	public abstract stream(request: GeminiRequest, signal?: AbortSignal): AsyncIterable<ModelChunk>;

	public abstract countTokens(request: GeminiRequest): Promise<TokenCount>;
}
