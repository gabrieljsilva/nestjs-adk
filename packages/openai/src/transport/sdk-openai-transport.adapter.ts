import { ModelCallFailedError, type ModelChunk } from "@nestjs-adk/core";
import type { ChatCompletionChunk, ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import type { OpenAiChatRequest } from "../mapping/openai-chat-request.value-object";
import { OpenAiFailureMapper } from "../mapping/openai-failure.mapper";
import { OpenAiStreamMapper } from "../mapping/openai-stream.mapper";
import { OpenAiReasoningTrace } from "../model/openai-reasoning-trace.value-object";
import type { OpenAiOptions } from "../model/openai.options";
import type { OpenAiChatClient } from "./openai-chat-client.contract";
import { OpenAiClientFactory } from "./openai-client.factory";
import { OpenAiTransport } from "./openai-transport.contract";

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

	public get baseURL(): string | undefined {
		return this.options.baseURL;
	}

	public async *stream(request: OpenAiChatRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		const stream = await this.open(request, signal);
		const trace = new OpenAiReasoningTrace();
		try {
			for await (const raw of stream) {
				for (const chunk of this.chunks.toChunks(raw, trace)) yield chunk;
			}
		} catch (error) {
			throw new ModelCallFailedError(this.failures.toFailure(error), request.model);
		}
	}

	private async open(request: OpenAiChatRequest, signal?: AbortSignal): Promise<AsyncIterable<ChatCompletionChunk>> {
		try {
			return await this.client.chat.completions.create(this.buildBody(request), { signal });
		} catch (error) {
			throw new ModelCallFailedError(this.failures.toFailure(error), request.model);
		}
	}

	private buildBody(request: OpenAiChatRequest): ChatCompletionCreateParamsStreaming {
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
