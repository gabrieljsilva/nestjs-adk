import { CallCost } from "../../domain/cost/call-cost.value-object";
import { CostBreakdown } from "../../domain/cost/cost-breakdown.value-object";
import type { ModelPrice } from "../../domain/cost/model-price.value-object";
import type { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import type { ModelUsage } from "../../domain/model/usage/model-usage.value-object";

export class CostCalculator {
	public calculateCost(model: ModelIdentity, price: ModelPrice, usage: ModelUsage): CallCost {
		const rates = price.resolveRates(usage.inputTokens);
		const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
		const fresh = usage.inputTokens - cached;

		const breakdown = new CostBreakdown(
			rates.input.calculateCost(fresh),
			rates.output.calculateCost(usage.outputTokens),
			rates.cached.calculateCost(cached),
		);
		return new CallCost(model, usage, breakdown, rates);
	}
}
