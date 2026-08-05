import { ModelCallFailedError, type ModelChunk } from "@nestjs-adk/core/native";
import type { ChatCompletionChunk, ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import type { OpenAiChatClient } from "./openai-chat-client";
import type { OpenAiChatRequest } from "./openai-chat-request";
import { OpenAiClientFactory } from "./openai-client-factory";
import { OpenAiFailureMapper } from "./openai-failure-mapper";
import type { OpenAiOptions } from "./openai-options";
import { OpenAiStreamMapper } from "./openai-stream-mapper";
import { OpenAiTransport } from "./openai-transport";

/**
 * Talks to a real OpenAI compatible endpoint.
 *
 * Always streaming, even when the caller wants one answer: the contract says a model
 * emits chunks and the executor aggregates them, so a non streaming call would only
 * mean the same aggregation happening twice in different places.
 *
 * Usage is asked for explicitly, because Chat Completions omits it from a stream
 * unless told otherwise, and a run with no usage cannot be priced.
 */
export class SdkOpenAiTransport extends OpenAiTransport {
	private readonly client: OpenAiChatClient;

	public constructor(
		private readonly options: OpenAiOptions = {},
		factory: OpenAiClientFactory = new OpenAiClientFactory(),
		private readonly chunks: OpenAiStreamMapper = new OpenAiStreamMapper(),
		private readonly failures: OpenAiFailureMapper = new OpenAiFailureMapper(),
	) {
		super();
		this.client = factory.create(options);
	}

	/** The endpoint this transport was pointed at, which is the whole of reaching a compatible API. */
	public get baseURL(): string | undefined {
		return this.options.baseURL;
	}

	public async *stream(request: OpenAiChatRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		const stream = await this.open(request, signal);
		try {
			for await (const raw of stream) {
				for (const chunk of this.chunks.toChunks(raw)) yield chunk;
			}
		} catch (error) {
			throw new ModelCallFailedError(this.failures.toFailure(error), request.model);
		}
	}

	/** Opening and reading fail differently for a caller, and identically for a policy. */
	private async open(request: OpenAiChatRequest, signal?: AbortSignal): Promise<AsyncIterable<ChatCompletionChunk>> {
		try {
			return await this.client.chat.completions.create(this.bodyOf(request), { signal });
		} catch (error) {
			throw new ModelCallFailedError(this.failures.toFailure(error), request.model);
		}
	}

	private bodyOf(request: OpenAiChatRequest): ChatCompletionCreateParamsStreaming {
		const body: ChatCompletionCreateParamsStreaming = {
			...request.parameters,
			model: request.model,
			messages: [...request.messages],
			stream: true,
			stream_options: { include_usage: true },
		};
		if (!request.hasTools) return body;
		return { ...body, tools: [...request.tools] };
	}
}
