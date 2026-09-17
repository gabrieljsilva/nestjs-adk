import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import type { ModelUsage } from "../model/usage/model-usage.value-object";
import type { AppliedRates } from "./applied-rates.value-object";
import type { CostBreakdown } from "./cost-breakdown.value-object";
import type { UsdAmount } from "./usd-amount.value-object";

export class CallCost {
	public constructor(
		public readonly model: ModelIdentity,
		public readonly usage: ModelUsage,
		public readonly breakdown: CostBreakdown,
		public readonly rates: AppliedRates,
	) {}

	public get amount(): UsdAmount {
		return this.breakdown.total;
	}
}
