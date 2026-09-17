import { ModelCallFailedError, type ModelChunk, TokenCount } from "@nestjs-adk/core";
import { GeminiFailureMapper } from "../mapping/gemini-failure.mapper";
import type { GeminiRequest } from "../mapping/gemini-request.value-object";
import { type GeminiResponseChunk, GeminiStreamMapper } from "../mapping/gemini-stream.mapper";
import type { GeminiOptions } from "../model/gemini.options";
import { GeminiTransport } from "./gemini-transport.contract";
import type { GenAiClient } from "./genai-client.contract";
import { GenAiClientFactory } from "./genai-client.factory";

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

	public get isVertex(): boolean {
		return this.options.vertexai === true;
	}

	public async *stream(request: GeminiRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		const stream = await this.open(request, signal);
		let calls = 0;
		try {
			for await (const raw of stream) {
				for (const chunk of this.chunks.toChunks(raw, calls)) {
					if (chunk.toolCall !== undefined) calls += 1;
					yield chunk;
				}
			}
		} catch (error) {
			throw new ModelCallFailedError(this.failures.toFailure(error), request.model);
		}
	}

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
