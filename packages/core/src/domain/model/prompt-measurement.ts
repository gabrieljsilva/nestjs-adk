import type { ModelIdentity } from "./model-identity";
import type { ModelUsage } from "./model-usage";

/**
 * How large a prompt was, in tokens the provider counted and in the characters it counted them over.
 *
 * The three parts only mean anything together. A token count without the text it counted
 * cannot be carried to the next turn, because the next prompt is longer, and the ratio
 * between the two sizes is what carries a past measurement forward. And a count without
 * the model that produced it cannot be carried across a failover: providers tokenize
 * differently, so the same text measured by one says little about the window of another.
 *
 * It is the only carrier of an absolute size in the runtime, and it always describes a
 * call that already happened.
 */
export class PromptMeasurement {
	private constructor(
		public readonly usage: ModelUsage,
		public readonly characters: number,
		public readonly model?: ModelIdentity,
	) {}

	/**
	 * A measurement, or nothing when the provider reported no input at all.
	 *
	 * Zero input tokens is not a small prompt, it is a provider that said nothing. Kept
	 * as a measurement it would read as a window with all its room free, which is the
	 * one answer worse than admitting the size is unknown.
	 */
	public static from(usage: ModelUsage, characters: number, model?: ModelIdentity): PromptMeasurement | undefined {
		if (usage.inputTokens <= 0) return undefined;
		return new PromptMeasurement(usage, Math.max(0, Math.trunc(characters)), model);
	}

	/** The same measurement, or nothing, when another model is the one about to be called. */
	public takenBy(model: ModelIdentity): PromptMeasurement | undefined {
		if (this.model === undefined) return undefined;
		return this.model.equals(model) ? this : undefined;
	}
}
