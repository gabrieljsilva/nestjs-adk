import { describe, expect, it } from "vitest";
import { NegativeAmountError } from "./errors/negative-amount.error";
import { ModelPrice } from "./model-price";
import { PriceBand } from "./price-band";
import { TokenRate } from "./token-rate";

const INPUT = TokenRate.fromUsdPerToken(1e-7);
const OUTPUT = TokenRate.fromUsdPerToken(4e-7);
const CACHE = TokenRate.fromUsdPerToken(2.5e-8);

describe("ModelPrice", () => {
	it("charges the base rates for a prompt under every band", () => {
		const price = ModelPrice.of(INPUT, OUTPUT, { bands: [PriceBand.above(200_000, { input: TokenRate.ofPico(999n) })] });

		const rates = price.ratesFor(1_000);

		expect(rates.input.equals(INPUT)).toBe(true);
		expect(rates.output.equals(OUTPUT)).toBe(true);
	});

	it("charges the band once the prompt passes its threshold", () => {
		const above = TokenRate.fromUsdPerToken(2e-7);
		const price = ModelPrice.of(INPUT, OUTPUT, { bands: [PriceBand.above(200_000, { input: above })] });

		expect(price.ratesFor(200_001).input.equals(above)).toBe(true);
	});

	/** The threshold is the floor of the band above it, so a prompt exactly on it is still below. */
	it("leaves a prompt exactly on the threshold in the lower band", () => {
		const price = ModelPrice.of(INPUT, OUTPUT, { bands: [PriceBand.above(200_000, { input: TokenRate.ofPico(999n) })] });

		expect(price.ratesFor(200_000).input.equals(INPUT)).toBe(true);
	});

	it("takes the highest band the prompt passed, however the bands were listed", () => {
		const first = TokenRate.fromUsdPerToken(2e-7);
		const second = TokenRate.fromUsdPerToken(3e-7);
		const price = ModelPrice.of(INPUT, OUTPUT, {
			bands: [PriceBand.above(1_000_000, { input: second }), PriceBand.above(200_000, { input: first })],
		});

		expect(price.ratesFor(300_000).input.equals(first)).toBe(true);
		expect(price.ratesFor(2_000_000).input.equals(second)).toBe(true);
	});

	/** A band replaces only what it declares, because that is what the provider published. */
	it("leaves a rate the band said nothing about where the base had it", () => {
		const above = TokenRate.fromUsdPerToken(2e-7);
		const price = ModelPrice.of(INPUT, OUTPUT, { cacheRead: CACHE, bands: [PriceBand.above(200_000, { input: above })] });

		const rates = price.ratesFor(300_000);

		expect(rates.input.equals(above)).toBe(true);
		expect(rates.output.equals(OUTPUT)).toBe(true);
		expect(rates.cacheRead?.equals(CACHE)).toBe(true);
	});

	it("charges a cached token at the input rate when the provider publishes no cache rate", () => {
		const rates = ModelPrice.of(INPUT, OUTPUT).ratesFor(10);

		expect(rates.cacheRead).toBeUndefined();
		expect(rates.cached.equals(INPUT)).toBe(true);
	});

	it("charges a cached token at the cache rate when there is one", () => {
		const rates = ModelPrice.of(INPUT, OUTPUT, { cacheRead: CACHE }).ratesFor(10);

		expect(rates.cached.equals(CACHE)).toBe(true);
	});

	it("refuses a band below zero tokens", () => {
		expect(() => PriceBand.above(-1, { input: INPUT })).toThrow(NegativeAmountError);
		expect(() => PriceBand.above(1.5, { input: INPUT })).toThrow(NegativeAmountError);
	});
});
