import type { ModelUsage } from "../usage/model-usage.value-object";
import type { ToolCallDelta } from "./tool-call-delta.value-object";

/**
 * One increment of a generation, carrying one kind at a time: text, part of a tool call,
 * the usage the provider reported, or the reason the turn ended.
 * Text is always a delta and never a running total, and a model that does not stream
 * yields a single chunk with the complete text.
 */
export class ModelChunk {
	private constructor(
		public readonly textDelta: string,
		public readonly finishReason?: string,
		public readonly toolCall?: ToolCallDelta,
		public readonly usage?: ModelUsage,
	) {}

	public static text(delta: string): ModelChunk {
		return new ModelChunk(delta);
	}

	public static toolCall(delta: ToolCallDelta): ModelChunk {
		return new ModelChunk("", undefined, delta);
	}

	public static usage(usage: ModelUsage): ModelChunk {
		return new ModelChunk("", undefined, undefined, usage);
	}

	public static finish(reason: string): ModelChunk {
		return new ModelChunk("", reason);
	}

	public get isFinal(): boolean {
		return this.finishReason !== undefined;
	}

	public get hasText(): boolean {
		return this.textDelta.length > 0;
	}
}
