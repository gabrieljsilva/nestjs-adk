import type { ModelUsage } from "./model-usage";
import type { ToolCallDelta } from "./tool-call-delta";

/**
 * One increment of a generation.
 *
 * Text is always a delta, never a running total, and no chunk ever repeats the whole
 * answer: aggregation belongs to the executor. A model that does not stream yields a
 * single chunk carrying the complete text, and both paths then agree by construction.
 *
 * A chunk carries one kind of increment at a time: text, part of a tool call, the
 * usage the provider reported, or the reason the turn ended.
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

	/** Usage arrives at the end for most providers, and never for some. */
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
