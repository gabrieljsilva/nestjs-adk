import type { ModelIdentity } from "../model/model-identity";

/**
 * Why a call could not be priced. Each one is a different thing for an operator to fix.
 *
 * There are three because there are three things the reporter can tell apart. A source that
 * publishes half a price answers `undefined` like any source that does not know the model, since
 * half a price is not a cheaper price, and it arrives here as `unknown-model`.
 */
export type UnpricedReason =
	/** Nothing was declared, so nothing could be priced. */
	| "no-source"
	/** A source is declared and has no usable price for this model, often a name that drifted. */
	| "unknown-model"
	/** The provider reported no token usage, so there is nothing to multiply a rate by. */
	| "no-usage";

/**
 * A call that happened and could not be turned into money.
 *
 * It exists so that a zero is never mistaken for free. The run carries on and answers a cost
 * that leaves these tokens out, and this is what tells somebody why the number is smaller than
 * the invoice will be.
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
