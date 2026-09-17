import type { ModelIdentity } from "./descriptor/model-identity.value-object";
import type { ToolCall } from "./messages/tool-call.value-object";
import { ModelUsage } from "./usage/model-usage.value-object";

/**
 * One turn of a model, whole: what the chunks added up to.
 * `text` is the concatenation of the text deltas, so a consumer that printed the stream
 * already saw it. Text and tool calls are reported apart, never folded together.
 */
export class ModelResponse {
	public constructor(
		public readonly model: ModelIdentity,
		public readonly text: string,
		public readonly toolCalls: readonly ToolCall[] = [],
		public readonly usage: ModelUsage = ModelUsage.none(),
		public readonly finishReason?: string,
		public readonly structuredOutput?: unknown,
	) {}

	public get hasToolCalls(): boolean {
		return this.toolCalls.length > 0;
	}

	public get hasText(): boolean {
		return this.text.length > 0;
	}

	public get isEmpty(): boolean {
		return !this.hasText && !this.hasToolCalls;
	}
}
