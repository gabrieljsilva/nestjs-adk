import type { ChatCompletionChunk, ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";

export interface OpenAiChatClient {
	chat: {
		completions: {
			create(
				body: ChatCompletionCreateParamsStreaming,
				options?: { signal?: AbortSignal },
			): Promise<AsyncIterable<ChatCompletionChunk>>;
		};
	};
}
