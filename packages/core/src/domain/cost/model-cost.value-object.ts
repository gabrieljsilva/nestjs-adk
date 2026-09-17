import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import { ModelUsage } from "../model/usage/model-usage.value-object";
import { CostBreakdown } from "./cost-breakdown.value-object";
import type { UsdAmount } from "./usd-amount.value-object";

/**
 * What one model cost across a whole run, however many calls it served.
 *
 * It carries the breakdown and not the rates: calls of different prompt sizes can land in
 * different price bands, so one rate for the aggregate would be a fiction.
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

	public including(usage: ModelUsage, breakdown: CostBreakdown): ModelCost {
		return new ModelCost(this.model, this.calls + 1, this.usage.plus(usage), this.breakdown.plus(breakdown));
	}

	public get amount(): UsdAmount {
		return this.breakdown.total;
	}
}
