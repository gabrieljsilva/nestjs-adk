import type { ModelIdentity } from "./model-identity";
import { ModelUsage } from "./model-usage";
import type { ToolCall } from "./tool-call";

/**
 * One turn of a model, whole.
 *
 * It is what the chunks added up to, and nothing the model streamed is repeated here:
 * `text` is the concatenation of the text deltas, so a consumer that printed the stream
 * and then printed this would print the answer twice on purpose, not by accident.
 *
 * A turn is either words or work: a model that asked for tools usually says little
 * while doing it, and both halves are reported rather than one being folded into the
 * other.
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

	/** A turn that said nothing and asked for nothing, which is a provider answering badly. */
	public get isEmpty(): boolean {
		return !this.hasText && !this.hasToolCalls;
	}
}
