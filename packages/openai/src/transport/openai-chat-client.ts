import type { ChatCompletionChunk, ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";

/**
 * The one thing this adapter needs from an OpenAI client: a streamed completion.
 *
 * The official client satisfies it structurally, so nothing is asserted, and a test can
 * satisfy it with an object that yields the chunks a spec cares about.
 */
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
