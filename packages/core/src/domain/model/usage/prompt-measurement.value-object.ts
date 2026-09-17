import type { ModelIdentity } from "../descriptor/model-identity.value-object";
import type { ModelUsage } from "./model-usage.value-object";

/**
 * How large a prompt was: the tokens the provider counted, the characters they were counted
 * over, and the model that counted them. The three only mean anything together.
 * It always describes a call that already happened.
 */
export class PromptMeasurement {
	private constructor(
		public readonly usage: ModelUsage,
		public readonly characters: number,
		public readonly model?: ModelIdentity,
	) {}

	public static from(usage: ModelUsage, characters: number, model?: ModelIdentity): PromptMeasurement | undefined {
		if (usage.inputTokens <= 0) return undefined;
		return new PromptMeasurement(usage, Math.max(0, Math.trunc(characters)), model);
	}

	public takenBy(model: ModelIdentity): PromptMeasurement | undefined {
		if (this.model === undefined) return undefined;
		return this.model.equals(model) ? this : undefined;
	}
}
