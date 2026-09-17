import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import type { ModelUsage } from "../model/usage/model-usage.value-object";
import type { AppliedRates } from "./applied-rates.value-object";
import type { CostBreakdown } from "./cost-breakdown.value-object";
import type { UsdAmount } from "./usd-amount.value-object";

/**
 * What one model call cost, with the tokens and the rates that produced it.
 *
 * The usage and the rates travel with the amount so that the number can be checked without
 * being trusted: a consumer that disagrees can multiply the same inputs itself. That matters
 * more here than elsewhere, because these numbers end up on somebody's invoice.
 */
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
