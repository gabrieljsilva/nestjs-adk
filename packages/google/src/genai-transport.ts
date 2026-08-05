import { ModelCallFailedError, type ModelChunk, TokenCount } from "@nestjs-adk/core";
import { GeminiFailureMapper } from "./gemini-failure-mapper";
import type { GeminiOptions } from "./gemini-options";
import type { GeminiRequest } from "./gemini-request";
import { type GeminiResponseChunk, GeminiStreamMapper } from "./gemini-stream-mapper";
import { GeminiTransport } from "./gemini-transport";
import type { GenAiClient } from "./genai-client";
import { GenAiClientFactory } from "./genai-client-factory";

/**
 * Talks to a real Gemini endpoint, on either surface.
 *
 * Always streaming, even when the caller wants one answer: the contract says a model
 * emits chunks and the executor aggregates them, so a non streaming call would only
 * mean the same aggregation happening twice in different places.
 */
export class GenAiTransport extends GeminiTransport {
	private readonly client: GenAiClient;

	public constructor(
		private readonly options: GeminiOptions = {},
		factory: GenAiClientFactory = new GenAiClientFactory(),
		private readonly chunks: GeminiStreamMapper = new GeminiStreamMapper(),
		private readonly failures: GeminiFailureMapper = new GeminiFailureMapper(),
	) {
		super();
		this.client = factory.create(options);
	}

	/** Which surface this transport was pointed at, which is the only difference between them. */
	public get isVertex(): boolean {
		return this.options.vertexai === true;
	}

	public async *stream(request: GeminiRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		const stream = await this.open(request, signal);
		try {
			for await (const raw of stream) {
				for (const chunk of this.chunks.toChunks(raw)) yield chunk;
			}
		} catch (error) {
			throw new ModelCallFailedError(this.failures.toFailure(error), request.model);
		}
	}

	/** Gemini counts before the fact, so this is measured and never an estimate. */
	public async countTokens(request: GeminiRequest): Promise<TokenCount> {
		try {
			const response = await this.client.models.countTokens({
				model: request.model,
				contents: [...request.contents],
			});
			return TokenCount.measured(response.totalTokens ?? 0);
		} catch (error) {
			throw new ModelCallFailedError(this.failures.toFailure(error), request.model);
		}
	}

	private async open(request: GeminiRequest, signal?: AbortSignal): Promise<AsyncIterable<GeminiResponseChunk>> {
		try {
			return await this.client.models.generateContentStream({
				model: request.model,
				contents: [...request.contents],
				config: { ...request.config, abortSignal: signal },
			});
		} catch (error) {
			throw new ModelCallFailedError(this.failures.toFailure(error), request.model);
		}
	}
}
