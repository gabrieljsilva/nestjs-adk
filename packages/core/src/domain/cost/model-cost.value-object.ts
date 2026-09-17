import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import { ModelUsage } from "../model/usage/model-usage.value-object";
import { CostBreakdown } from "./cost-breakdown.value-object";
import type { UsdAmount } from "./usd-amount.value-object";

/**
 * What one model cost across a whole run, however many calls it served.
 *
 * The usage is here next to the money because a ledger row needs both: an amount without the
 * tokens it was computed from cannot be checked against an invoice, and a run whose model went
 * unpriced still has tokens worth recording.
 *
 * It carries the breakdown but not the rates, and that omission is deliberate: calls of
 * different prompt sizes can land in different bands, so one rate for the aggregate would be a
 * fiction. A consumer that needs the rate reads it off the call.
 */
export class ModelCost {
	public constructor(
		public readonly model: ModelIdentity,
		public readonly calls: number,
		public readonly usage: ModelUsage,
		public readonly breakdown: CostBreakdown,
	) {}

	public static none(model: ModelIdentity): ModelCost {
		return new ModelCost(model, 0, ModelUsage.none(), CostBreakdown.zero());
	}

	/** One more call on the same model, which is how a run with a loop or a reroute adds up. */
	public including(usage: ModelUsage, breakdown: CostBreakdown): ModelCost {
		return new ModelCost(this.model, this.calls + 1, this.usage.plus(usage), this.breakdown.plus(breakdown));
	}

	public get amount(): UsdAmount {
		return this.breakdown.total;
	}
}
