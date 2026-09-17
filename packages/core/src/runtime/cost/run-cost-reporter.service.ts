import type { PricingNoticeSink } from "../../contracts/pricing/pricing-notice-sink.contract";
import type { PricingSource } from "../../contracts/pricing/pricing-source.contract";
import type { BilledCall } from "../../domain/cost/billed-call.value-object";
import { ModelCost } from "../../domain/cost/model-cost.value-object";
import type { ModelPrice } from "../../domain/cost/model-price.value-object";
import { ModelUnpriced, type UnpricedReason } from "../../domain/cost/model-unpriced.value-object";
import { RunCost } from "../../domain/cost/run-cost.value-object";
import type { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import type { CostCalculator } from "./cost-calculator.service";

export class RunCostReporter {
	public constructor(
		private readonly calculator: CostCalculator,
		private readonly source?: PricingSource,
		private readonly notices?: PricingNoticeSink,
	) {}

	public async report(context: SessionContext | undefined, calls: readonly BilledCall[]): Promise<RunCost> {
		if (calls.length === 0) return RunCost.nothing();
		if (this.source === undefined) {
			for (const call of calls) this.notice(context, call, "no-source");
			return RunCost.nothing(this.distinct(calls));
		}

		const unpriced = new Map<string, ModelIdentity>();
		const billable = calls.filter((call) => this.hasUsage(context, call, unpriced));
		if (billable.length === 0) return RunCost.nothing([...unpriced.values()]);

		const prices = await this.findPrices(context, billable);
		const byModel = new Map<string, ModelCost>();

		for (const call of billable) {
			const key = call.model.toString();
			const price = prices.get(key);
			if (price === undefined) {
				this.notice(context, call, "unknown-model");
				unpriced.set(key, call.model);
				continue;
			}
			const cost = this.calculator.calculateCost(call.model, price, call.usage);
			byModel.set(key, (byModel.get(key) ?? ModelCost.none(call.model)).including(call.usage, cost.breakdown));
		}

		return new RunCost([...byModel.values()], [...unpriced.values()]);
	}

	private hasUsage(
		context: SessionContext | undefined,
		call: BilledCall,
		unpriced: Map<string, ModelIdentity>,
	): boolean {
		if (call.usage.totalTokens > 0) return true;
		this.notice(context, call, "no-usage");
		unpriced.set(call.model.toString(), call.model);
		return false;
	}

	private async findPrices(
		context: SessionContext | undefined,
		calls: readonly BilledCall[],
	): Promise<Map<string, ModelPrice | undefined>> {
		const prices = new Map<string, ModelPrice | undefined>();
		for (const model of this.distinct(calls)) {
			const key = model.toString();
			if (prices.has(key)) continue;
			prices.set(key, await this.priceOrNothing(context, model));
		}
		return prices;
	}

	private async priceOrNothing(
		context: SessionContext | undefined,
		model: ModelIdentity,
	): Promise<ModelPrice | undefined> {
		try {
			return await this.source?.findPrice(context, model);
		} catch {
			return undefined;
		}
	}

	private distinct(calls: readonly BilledCall[]): readonly ModelIdentity[] {
		const seen = new Map<string, ModelIdentity>();
		for (const call of calls) seen.set(call.model.toString(), call.model);
		return [...seen.values()];
	}

	private notice(context: SessionContext | undefined, call: BilledCall, reason: UnpricedReason): void {
		try {
			this.notices?.report(context, new ModelUnpriced(call.model, reason, call.usage.totalTokens));
		} catch {}
	}
}
