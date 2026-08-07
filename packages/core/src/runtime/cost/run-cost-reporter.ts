import type { PricingNoticeSink } from "../../contracts/pricing-notice-sink";
import type { PricingSource } from "../../contracts/pricing-source";
import type { BilledCall } from "../../domain/cost/billed-call";
import { ModelCost } from "../../domain/cost/model-cost";
import type { ModelPrice } from "../../domain/cost/model-price";
import { ModelUnpriced, type UnpricedReason } from "../../domain/cost/model-unpriced";
import { RunCost } from "../../domain/cost/run-cost";
import type { ModelIdentity } from "../../domain/model/model-identity";
import type { CostCalculator } from "./cost-calculator";

/**
 * Prices a run once it is over.
 *
 * It runs after the last turn rather than between turns, because asking a source for a price is
 * I/O and a turn loop that awaited it would pay for the catalog on the critical path. Each
 * model is asked about once, however many calls it served.
 *
 * Nothing here can fail a run. No source, a source that does not know the model, a source that
 * throws, a price with a hole in it, a provider that reported no tokens: every one of them ends
 * the same way, with the call named in `unpriced`, its tokens out of the total, and a notice for
 * whoever asked to hear about it. A cost is a report, and a report is never worth a
 * conversation.
 */
export class RunCostReporter {
	public constructor(
		private readonly calculator: CostCalculator,
		private readonly source?: PricingSource,
		private readonly notices?: PricingNoticeSink,
	) {}

	public async report(calls: readonly BilledCall[]): Promise<RunCost> {
		if (calls.length === 0) return RunCost.nothing();
		if (this.source === undefined) {
			for (const call of calls) this.notice(call, "no-source");
			return RunCost.nothing(this.distinct(calls));
		}

		const unpriced = new Map<string, ModelIdentity>();
		// Usage first: a call the provider reported nothing for has no price, whatever a catalog
		// says, and this is what keeps a source from being asked about a model it cannot help with.
		const billable = calls.filter((call) => this.hasUsage(call, unpriced));
		if (billable.length === 0) return RunCost.nothing([...unpriced.values()]);

		const prices = await this.pricesFor(billable);
		const byModel = new Map<string, ModelCost>();

		for (const call of billable) {
			const key = call.model.toString();
			const price = prices.get(key);
			if (price === undefined) {
				this.notice(call, "unknown-model");
				unpriced.set(key, call.model);
				continue;
			}
			const cost = this.calculator.costOf(call.model, price, call.usage);
			byModel.set(key, (byModel.get(key) ?? ModelCost.none(call.model)).including(call.usage, cost.breakdown));
		}

		return RunCost.of([...byModel.values()], [...unpriced.values()]);
	}

	private hasUsage(call: BilledCall, unpriced: Map<string, ModelIdentity>): boolean {
		if (call.usage.totalTokens > 0) return true;
		this.notice(call, "no-usage");
		unpriced.set(call.model.toString(), call.model);
		return false;
	}

	/** One question per model, because a loop of eight turns on one model is still one price. */
	private async pricesFor(calls: readonly BilledCall[]): Promise<Map<string, ModelPrice | undefined>> {
		const prices = new Map<string, ModelPrice | undefined>();
		for (const model of this.distinct(calls)) {
			const key = model.toString();
			if (prices.has(key)) continue;
			prices.set(key, await this.priceOrNothing(model));
		}
		return prices;
	}

	/** A source that throws is a source that does not know: the run already happened either way. */
	private async priceOrNothing(model: ModelIdentity): Promise<ModelPrice | undefined> {
		try {
			return await this.source?.priceOf(model);
		} catch {
			return undefined;
		}
	}

	private distinct(calls: readonly BilledCall[]): readonly ModelIdentity[] {
		const seen = new Map<string, ModelIdentity>();
		for (const call of calls) seen.set(call.model.toString(), call.model);
		return [...seen.values()];
	}

	/** A sink is off the path of a decision, so one that throws does not take the run with it. */
	private notice(call: BilledCall, reason: UnpricedReason): void {
		try {
			this.notices?.report(new ModelUnpriced(call.model, reason, call.usage.totalTokens));
		} catch {
			// A sink that cannot report is not a reason to lose the answer the run already produced.
		}
	}
}
