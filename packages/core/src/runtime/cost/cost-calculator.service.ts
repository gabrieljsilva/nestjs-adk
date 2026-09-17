import { CallCost } from "../../domain/cost/call-cost.value-object";
import { CostBreakdown } from "../../domain/cost/cost-breakdown.value-object";
import type { ModelPrice } from "../../domain/cost/model-price.value-object";
import type { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import type { ModelUsage } from "../../domain/model/usage/model-usage.value-object";

/**
 * Turns tokens into money, and nothing else.
 *
 * No I/O and no decisions about where a price came from: it is handed a price and a usage and
 * answers what that call cost. That is what makes the arithmetic checkable in isolation, which
 * matters more here than in most places.
 *
 * The cached share is discounted from the input rather than added to it. Providers report
 * cached tokens inside the prompt count, so charging both would bill the same tokens twice.
 */
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
