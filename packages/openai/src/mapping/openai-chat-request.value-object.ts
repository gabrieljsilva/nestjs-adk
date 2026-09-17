import type { ChatCompletionFunctionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions";

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
