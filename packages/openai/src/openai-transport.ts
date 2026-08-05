import type { ModelChunk } from "@nestjs-adk/core";
import type { OpenAiChatRequest } from "./openai-chat-request";

/**
 * What actually talks to an OpenAI compatible endpoint.
 *
 * It exists as a port so the adapter can be driven in a test without the SDK, without
 * a network and without a key. The production implementation is the only file in this
 * package that imports `openai`.
 */
export abstract class OpenAiTransport {
	public abstract stream(request: OpenAiChatRequest, signal?: AbortSignal): AsyncIterable<ModelChunk>;
}
