import { describe, expect, it, vi } from "vitest";
import { PricingNoticeSink } from "../../contracts/pricing-notice-sink";
import { PricingSource } from "../../contracts/pricing-source";
import { BilledCall } from "../../domain/cost/billed-call";
import { ModelPrice } from "../../domain/cost/model-price";
import type { ModelUnpriced } from "../../domain/cost/model-unpriced";
import { TokenRate } from "../../domain/cost/token-rate";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelUsage } from "../../domain/model/model-usage";
import { CostCalculator } from "./cost-calculator";
import { RunCostReporter } from "./run-cost-reporter";

const LUNA = ModelIdentity.of("openai", "gpt-5.6-luna");
const FLASH = ModelIdentity.of("google", "gemini-3.5-flash-lite");
const PRICE = ModelPrice.of(TokenRate.fromUsdPerToken(1e-7), TokenRate.fromUsdPerToken(4e-7));

class CatalogOf extends PricingSource {
	public readonly asked: string[] = [];

	public constructor(private readonly known: Record<string, ModelPrice>) {
		super();
	}

	public async priceOf(model: ModelIdentity): Promise<ModelPrice | undefined> {
		this.asked.push(model.toString());
		return this.known[model.toString()];
	}
}

class CollectedNotices extends PricingNoticeSink {
	public readonly reported: ModelUnpriced[] = [];

	public report(notice: ModelUnpriced): void {
		this.reported.push(notice);
	}
}

const reporterOn = (source?: PricingSource, notices?: PricingNoticeSink) =>
	new RunCostReporter(new CostCalculator(), source, notices);

describe("RunCostReporter", () => {
	it("adds up every call a model served into one entry", async () => {
		const cost = await reporterOn(new CatalogOf({ [LUNA.toString()]: PRICE })).report([
			new BilledCall(LUNA, ModelUsage.of(40, 12)),
			new BilledCall(LUNA, ModelUsage.of(60, 8)),
		]);

		expect(cost.byModel).toHaveLength(1);
		expect(cost.byModel[0]?.calls).toBe(2);
		expect(cost.total.pico).toBe(18_000_000n);
		expect(cost.isComplete).toBe(true);
	});

	/** A reroute is the reason cost is kept per model: two providers served one run. */
	it("keeps a rerouted run's models apart", async () => {
		const source = new CatalogOf({ [LUNA.toString()]: PRICE, [FLASH.toString()]: PRICE });

		const cost = await reporterOn(source).report([
			new BilledCall(LUNA, ModelUsage.of(10, 0)),
			new BilledCall(FLASH, ModelUsage.of(10, 0)),
		]);

		expect(cost.byModel.map((model) => model.model.toString())).toEqual([LUNA.toString(), FLASH.toString()]);
		expect(cost.byModel.every((model) => model.calls === 1)).toBe(true);
		expect(cost.calls).toBe(2);
	});

	it("asks the source once per model however many calls it served", async () => {
		const source = new CatalogOf({ [LUNA.toString()]: PRICE });

		await reporterOn(source).report([
			new BilledCall(LUNA, ModelUsage.of(1, 1)),
			new BilledCall(LUNA, ModelUsage.of(1, 1)),
			new BilledCall(LUNA, ModelUsage.of(1, 1)),
		]);

		expect(source.asked).toEqual([LUNA.toString()]);
	});

	it("leaves an unknown model's tokens out of the total and says so", async () => {
		const notices = new CollectedNotices();

		const cost = await reporterOn(new CatalogOf({ [LUNA.toString()]: PRICE }), notices).report([
			new BilledCall(LUNA, ModelUsage.of(40, 12)),
			new BilledCall(FLASH, ModelUsage.of(1_000_000, 1_000_000)),
		]);

		expect(cost.total.pico).toBe(8_800_000n);
		expect(cost.unpriced.map((model) => model.toString())).toEqual([FLASH.toString()]);
		expect(cost.isComplete).toBe(false);
		expect(notices.reported).toHaveLength(1);
		expect(notices.reported[0]?.reason).toBe("unknown-model");
		expect(notices.reported[0]?.tokens).toBe(2_000_000);
	});

	/** Zero has to be distinguishable from free, and `isComplete` is what distinguishes it. */
	it("answers zero with a warning when no source was declared", async () => {
		const notices = new CollectedNotices();

		const cost = await reporterOn(undefined, notices).report([new BilledCall(LUNA, ModelUsage.of(40, 12))]);

		expect(cost.total.isZero).toBe(true);
		expect(cost.byModel).toEqual([]);
		expect(cost.unpriced.map((model) => model.toString())).toEqual([LUNA.toString()]);
		expect(cost.isComplete).toBe(false);
		expect(notices.reported[0]?.reason).toBe("no-source");
	});

	it("reports a call the provider gave no usage for instead of pricing it as free", async () => {
		const notices = new CollectedNotices();

		const cost = await reporterOn(new CatalogOf({ [LUNA.toString()]: PRICE }), notices).report([
			new BilledCall(LUNA, ModelUsage.none()),
		]);

		expect(cost.byModel).toEqual([]);
		expect(cost.unpriced).toHaveLength(1);
		expect(notices.reported[0]?.reason).toBe("no-usage");
	});

	/** A catalog behind a network call will be down one day, and the run already happened. */
	it("treats a source that throws as a source that does not know the model", async () => {
		const notices = new CollectedNotices();
		const source = new (class extends PricingSource {
			public async priceOf(): Promise<ModelPrice | undefined> {
				throw new Error("catalog is down");
			}
		})();

		const cost = await reporterOn(source, notices).report([new BilledCall(LUNA, ModelUsage.of(40, 12))]);

		expect(cost.total.isZero).toBe(true);
		expect(cost.unpriced).toHaveLength(1);
		expect(notices.reported[0]?.reason).toBe("unknown-model");
	});

	it("does not lose the report when the sink throws", async () => {
		const notices = new (class extends PricingNoticeSink {
			public report(): void {
				throw new Error("sink is broken");
			}
		})();

		const cost = await reporterOn(new CatalogOf({ [LUNA.toString()]: PRICE }), notices).report([
			new BilledCall(LUNA, ModelUsage.of(40, 12)),
			new BilledCall(FLASH, ModelUsage.of(10, 0)),
		]);

		expect(cost.total.pico).toBe(8_800_000n);
		expect(cost.unpriced).toHaveLength(1);
	});

	it("answers zero without asking anything when no call was billed", async () => {
		const source = new CatalogOf({});
		const notices = new CollectedNotices();

		const cost = await reporterOn(source, notices).report([]);

		expect(cost.total.isZero).toBe(true);
		expect(cost.isComplete).toBe(true);
		expect(source.asked).toEqual([]);
		expect(notices.reported).toEqual([]);
	});

	it("prices without a sink declared", async () => {
		const cost = await reporterOn(new CatalogOf({})).report([new BilledCall(LUNA, ModelUsage.of(40, 12))]);

		expect(cost.isComplete).toBe(false);
	});

	/** Pricing is I/O, so it must not run between turns: the calls arrive together, once. */
	it("prices after the run rather than per call", async () => {
		const priceOf = vi.fn(async () => PRICE);
		const source = new (class extends PricingSource {
			public priceOf = priceOf;
		})();

		await reporterOn(source).report([
			new BilledCall(LUNA, ModelUsage.of(1, 1)),
			new BilledCall(LUNA, ModelUsage.of(1, 1)),
		]);

		expect(priceOf).toHaveBeenCalledTimes(1);
	});
});
