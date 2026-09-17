import type { ModelChunk, TokenCount } from "@nestjs-adk/core";
import type { GeminiRequest } from "../mapping/gemini-request.value-object";

/**
 * The single seam between this adapter and Google's SDK. Implement it and pass it to
 * `GeminiModel` to route through a proxy, record traffic, or run without a network.
 *
 * `stream` must honor `signal`, since aborting it is the only way to stop a generation that is
 * still being billed.
 */
export abstract class GeminiTransport {
	public abstract stream(request: GeminiRequest, signal?: AbortSignal): AsyncIterable<ModelChunk>;

	public abstract countTokens(request: GeminiRequest): Promise<TokenCount>;
}
