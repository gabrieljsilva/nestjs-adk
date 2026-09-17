import { describe, expect, it, vi } from "vitest";
import { SessionId } from "../../common/identity/session-id.value-object";
import { PricingNoticeSink } from "../../contracts/pricing/pricing-notice-sink.contract";
import { PricingSource } from "../../contracts/pricing/pricing-source.contract";
import { BilledCall } from "../../domain/cost/billed-call.value-object";
import { ModelPrice } from "../../domain/cost/model-price.value-object";
import type { ModelUnpriced } from "../../domain/cost/model-unpriced.value-object";
import { TokenRate } from "../../domain/cost/token-rate.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { ModelUsage } from "../../domain/model/usage/model-usage.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { CostCalculator } from "./cost-calculator.service";
import { RunCostReporter } from "./run-cost-reporter.service";

const LUNA = new ModelIdentity("openai", "gpt-5.6-luna");
const FLASH = new ModelIdentity("google", "gemini-3.5-flash-lite");
const PRICE = new ModelPrice(TokenRate.fromUsdPerToken(1e-7), TokenRate.fromUsdPerToken(4e-7));

class CatalogOf extends PricingSource {
	public readonly asked: string[] = [];

	public constructor(private readonly known: Record<string, ModelPrice>) {
		super();
	}

	public async findPrice(_context: SessionContext | undefined, model: ModelIdentity): Promise<ModelPrice | undefined> {
		this.asked.push(model.toString());
		return this.known[model.toString()];
	}
}

class CollectedNotices extends PricingNoticeSink {
	public readonly reported: ModelUnpriced[] = [];

	public report(_context: SessionContext | undefined, notice: ModelUnpriced): void {
		this.reported.push(notice);
	}
}

const reporterOn = (source?: PricingSource, notices?: PricingNoticeSink) =>
	new RunCostReporter(new CostCalculator(), source, notices);

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));

describe("RunCostReporter", () => {
	it("adds up every call a model served into one entry", async () => {
		const cost = await reporterOn(new CatalogOf({ [LUNA.toString()]: PRICE })).report(CTX, [
			new BilledCall(LUNA, ModelUsage.fromReport(40, 12)),
			new BilledCall(LUNA, ModelUsage.fromReport(60, 8)),
		]);

		expect(cost.byModel).toHaveLength(1);
		expect(cost.byModel[0]?.calls).toBe(2);
		expect(cost.total.pico).toBe(18_000_000n);
		expect(cost.isComplete).toBe(true);
	});

	/** A reroute is the reason cost is kept per model: two providers served one run. */
	it("keeps a rerouted run's models apart", async () => {
		const source = new CatalogOf({ [LUNA.toString()]: PRICE, [FLASH.toString()]: PRICE });

		const cost = await reporterOn(source).report(CTX, [
			new BilledCall(LUNA, ModelUsage.fromReport(10, 0)),
			new BilledCall(FLASH, ModelUsage.fromReport(10, 0)),
		]);

		expect(cost.byModel.map((model) => model.model.toString())).toEqual([LUNA.toString(), FLASH.toString()]);
		expect(cost.byModel.every((model) => model.calls === 1)).toBe(true);
		expect(cost.calls).toBe(2);
	});

	it("asks the source once per model however many calls it served", async () => {
		const source = new CatalogOf({ [LUNA.toString()]: PRICE });

		await reporterOn(source).report(CTX, [
			new BilledCall(LUNA, ModelUsage.fromReport(1, 1)),
			new BilledCall(LUNA, ModelUsage.fromReport(1, 1)),
			new BilledCall(LUNA, ModelUsage.fromReport(1, 1)),
		]);

		expect(source.asked).toEqual([LUNA.toString()]);
	});

	it("leaves an unknown model's tokens out of the total and says so", async () => {
		const notices = new CollectedNotices();

		const cost = await reporterOn(new CatalogOf({ [LUNA.toString()]: PRICE }), notices).report(CTX, [
			new BilledCall(LUNA, ModelUsage.fromReport(40, 12)),
			new BilledCall(FLASH, ModelUsage.fromReport(1_000_000, 1_000_000)),
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

		const cost = await reporterOn(undefined, notices).report(CTX, [new BilledCall(LUNA, ModelUsage.fromReport(40, 12))]);

		expect(cost.total.isZero).toBe(true);
		expect(cost.byModel).toEqual([]);
		expect(cost.unpriced.map((model) => model.toString())).toEqual([LUNA.toString()]);
		expect(cost.isComplete).toBe(false);
		expect(notices.reported[0]?.reason).toBe("no-source");
	});

	it("reports a call the provider gave no usage for instead of pricing it as free", async () => {
		const notices = new CollectedNotices();

		const cost = await reporterOn(new CatalogOf({ [LUNA.toString()]: PRICE }), notices).report(CTX, [
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
			public async findPrice(_context: SessionContext | undefined): Promise<ModelPrice | undefined> {
				throw new Error("catalog is down");
			}
		})();

		const cost = await reporterOn(source, notices).report(CTX, [new BilledCall(LUNA, ModelUsage.fromReport(40, 12))]);

		expect(cost.total.isZero).toBe(true);
		expect(cost.unpriced).toHaveLength(1);
		expect(notices.reported[0]?.reason).toBe("unknown-model");
	});

	it("does not lose the report when the sink throws", async () => {
		const notices = new (class extends PricingNoticeSink {
			public report(_context: SessionContext | undefined): void {
				throw new Error("sink is broken");
			}
		})();

		const cost = await reporterOn(new CatalogOf({ [LUNA.toString()]: PRICE }), notices).report(CTX, [
			new BilledCall(LUNA, ModelUsage.fromReport(40, 12)),
			new BilledCall(FLASH, ModelUsage.fromReport(10, 0)),
		]);

		expect(cost.total.pico).toBe(8_800_000n);
		expect(cost.unpriced).toHaveLength(1);
	});

	it("answers zero without asking anything when no call was billed", async () => {
		const source = new CatalogOf({});
		const notices = new CollectedNotices();

		const cost = await reporterOn(source, notices).report(CTX, []);

		expect(cost.total.isZero).toBe(true);
		expect(cost.isComplete).toBe(true);
		expect(source.asked).toEqual([]);
		expect(notices.reported).toEqual([]);
	});

	it("prices without a sink declared", async () => {
		const cost = await reporterOn(new CatalogOf({})).report(CTX, [new BilledCall(LUNA, ModelUsage.fromReport(40, 12))]);

		expect(cost.isComplete).toBe(false);
	});

	/** Pricing is I/O, so it must not run between turns: the calls arrive together, once. */
	it("prices after the run rather than per call", async () => {
		const priceOf = vi.fn(async () => PRICE);
		const source = new (class extends PricingSource {
			public findPrice = priceOf;
		})();

		await reporterOn(source).report(CTX, [
			new BilledCall(LUNA, ModelUsage.fromReport(1, 1)),
			new BilledCall(LUNA, ModelUsage.fromReport(1, 1)),
		]);

		expect(priceOf).toHaveBeenCalledTimes(1);
	});
});
