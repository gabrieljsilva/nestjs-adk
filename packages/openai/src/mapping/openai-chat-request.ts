import type { ChatCompletionFunctionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * A Chat Completions request, already mapped and independent of the transport.
 *
 * The message and tool shapes are the SDK's own types on purpose: this package already
 * depends on the SDK, and borrowing its types means the type checker verifies the
 * mapping instead of an assertion doing it at the last moment. Only types are borrowed,
 * so nothing here runs SDK code, and a test can build a request without a client.
 */
export class OpenAiChatRequest {
	public constructor(
		public readonly model: string,
		public readonly messages: readonly ChatCompletionMessageParam[],
		public readonly tools: readonly ChatCompletionFunctionTool[] = [],
		public readonly parameters: Record<string, unknown> = {},
	) {}

	public get hasTools(): boolean {
		return this.tools.length > 0;
	}
}
