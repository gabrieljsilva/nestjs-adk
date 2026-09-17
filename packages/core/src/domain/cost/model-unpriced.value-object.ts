import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";

/** Why a call could not be priced. Each one is a different thing for an operator to fix. */
export type UnpricedReason = "no-source" | "unknown-model" | "no-usage";

/**
 * A call that happened and could not be turned into money.
 *
 * The run carries on and answers a cost that leaves these tokens out; this is what tells
 * somebody why the number is smaller than the invoice will be.
 */
export class ModelUnpriced {
	public constructor(
		public readonly model: ModelIdentity,
		public readonly reason: UnpricedReason,
		public readonly tokens: number,
	) {}

	public get message(): string {
		return `${this.model.toString()} billed ${this.tokens} tokens that were left out of the total: ${this.reason}.`;
	}
}
