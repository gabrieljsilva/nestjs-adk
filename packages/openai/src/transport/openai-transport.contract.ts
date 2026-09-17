import type { ModelChunk } from "@nestjs-adk/core";
import type { OpenAiChatRequest } from "../mapping/openai-chat-request.value-object";

/**
 * The single seam between this adapter and the HTTP client. Implement it and pass it to
 * `OpenAiModel` to route through a proxy, record traffic, or run without a network;
 * `SdkOpenAiTransport` is what is used otherwise.
 *
 * `stream` must honor `signal`, since aborting it is the only way to stop a generation that is
 * still being billed.
 */
export abstract class OpenAiTransport {
	public abstract stream(request: OpenAiChatRequest, signal?: AbortSignal): AsyncIterable<ModelChunk>;
}
