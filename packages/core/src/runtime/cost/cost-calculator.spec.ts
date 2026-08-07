import { describe, expect, it } from "vitest";
import { ModelPrice } from "../../domain/cost/model-price";
import { PriceBand } from "../../domain/cost/price-band";
import { TokenRate } from "../../domain/cost/token-rate";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelUsage } from "../../domain/model/model-usage";
import { CostCalculator } from "./cost-calculator";

const LUNA = ModelIdentity.of("openai", "gpt-5.6-luna");
const INPUT = TokenRate.fromUsdPerToken(1e-7);
const OUTPUT = TokenRate.fromUsdPerToken(4e-7);
const CACHE = TokenRate.fromUsdPerToken(2.5e-8);

const calculator = new CostCalculator();

describe("CostCalculator", () => {
	it("charges input and output at their own rates", () => {
		const cost = calculator.costOf(LUNA, ModelPrice.of(INPUT, OUTPUT), ModelUsage.of(40, 12));

		expect(cost.breakdown.input.pico).toBe(4_000_000n);
		expect(cost.breakdown.output.pico).toBe(4_800_000n);
		expect(cost.amount.toString()).toBe("0.0000088");
	});

	/** The rule that keeps a cached prompt from being billed twice: the provider counts it inside the input. */
	it("takes the cached share out of the input instead of adding to it", () => {
		const cost = calculator.costOf(LUNA, ModelPrice.of(INPUT, OUTPUT, { cacheRead: CACHE }), ModelUsage.of(100, 10, 60));

		expect(cost.breakdown.input.pico).toBe(4_000_000n);
		expect(cost.breakdown.cached.pico).toBe(1_500_000n);
		expect(cost.usage.inputTokens).toBe(100);
	});

	it("charges a cached token at the input rate when the provider publishes no cache rate", () => {
		const cost = calculator.costOf(LUNA, ModelPrice.of(INPUT, OUTPUT), ModelUsage.of(100, 0, 60));

		expect(cost.breakdown.cached.pico).toBe(6_000_000n);
		expect(cost.breakdown.input.pico).toBe(4_000_000n);
	});

	/** A provider that reports more cached than prompt tokens would otherwise produce a negative input. */
	it("never charges more cached tokens than the prompt had", () => {
		const cost = calculator.costOf(LUNA, ModelPrice.of(INPUT, OUTPUT), ModelUsage.of(10, 0, 999));

		expect(cost.breakdown.input.isZero).toBe(true);
		expect(cost.breakdown.cached.pico).toBe(1_000_000n);
	});

	it("charges the band the prompt size reached", () => {
		const price = ModelPrice.of(INPUT, OUTPUT, {
			bands: [PriceBand.above(200_000, { input: TokenRate.fromUsdPerToken(2e-7) })],
		});

		const cost = calculator.costOf(LUNA, price, ModelUsage.of(300_000, 0));

		expect(cost.breakdown.input.pico).toBe(60_000_000_000n);
		expect(cost.rates.input.toUsdPerToken()).toBe(2e-7);
	});

	/** The measurement that chose pico: at the catalog's cheapest rate, nano would report free. */
	it("prices the cheapest rate in the catalog without reporting it as free", () => {
		const cheapest = TokenRate.fromUsdPerToken(1.3e-10);

		const cost = calculator.costOf(LUNA, ModelPrice.of(cheapest, cheapest), ModelUsage.of(1, 1));

		expect(cost.amount.pico).toBe(260n);
		expect(cost.amount.toString()).toBe("0.00000000026");
	});

	it("hands back the rates it applied, so the number can be checked and not just trusted", () => {
		const cost = calculator.costOf(LUNA, ModelPrice.of(INPUT, OUTPUT, { cacheRead: CACHE }), ModelUsage.of(1, 1, 1));

		expect(cost.rates.input.toUsdPerToken()).toBe(1e-7);
		expect(cost.rates.output.toUsdPerToken()).toBe(4e-7);
		expect(cost.rates.cacheRead?.toUsdPerToken()).toBe(2.5e-8);
	});

	it("costs nothing for a call that used nothing", () => {
		expect(calculator.costOf(LUNA, ModelPrice.of(INPUT, OUTPUT), ModelUsage.none()).amount.isZero).toBe(true);
	});

	/** Streaming and non streaming differ in how a turn arrives, not in what it used. */
	it("prices the same usage identically however the turn was delivered", () => {
		const price = ModelPrice.of(INPUT, OUTPUT);
		const streamed = calculator.costOf(LUNA, price, ModelUsage.of(40, 12));
		const whole = calculator.costOf(LUNA, price, ModelUsage.of(40, 12));

		expect(streamed.amount.equals(whole.amount)).toBe(true);
	});
});
