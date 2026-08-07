import { describe, expect, it } from "vitest";
import { NegativeAmountError } from "./errors/negative-amount.error";
import { TokenRate } from "./token-rate";

describe("TokenRate", () => {
	it("takes a rate the way a catalog publishes it", () => {
		expect(TokenRate.fromUsdPerToken(1e-7).picoPerToken).toBe(100_000n);
	});

	/**
	 * The measurement that chose this scale.
	 *
	 * `1.3e-10` is the cheapest rate in the LiteLLM catalog. In nano dollars it is `0.13`,
	 * which truncates to nothing, so a model priced at it would look free.
	 */
	it("keeps the cheapest rate the catalog publishes", () => {
		const rate = TokenRate.fromUsdPerToken(1.3e-10);

		expect(rate.picoPerToken).toBe(130n);
		expect(rate.isZero).toBe(false);
	});

	/** `0.017 * 1e12` is `17000000000.000002` in float, and the nearest integer is what the catalog meant. */
	it("rounds to nearest, so a float artifact does not become a wrong rate", () => {
		expect(TokenRate.fromUsdPerToken(0.017).picoPerToken).toBe(17_000_000_000n);
		expect(TokenRate.fromUsdPerToken(0.135).picoPerToken).toBe(135_000_000_000n);
		expect(TokenRate.fromUsdPerToken(0.54).picoPerToken).toBe(540_000_000_000n);
	});

	it("comes back in the unit it arrived in", () => {
		expect(TokenRate.fromUsdPerToken(1.5e-7).toUsdPerToken()).toBe(1.5e-7);
		expect(TokenRate.fromUsdPerToken(1.3e-10).toUsdPerToken()).toBe(1.3e-10);
	});

	it("charges a token count without drifting", () => {
		expect(TokenRate.fromUsdPerToken(1e-7).costOf(40).pico).toBe(4_000_000n);
		expect(TokenRate.fromUsdPerToken(1.3e-10).costOf(1_000_000).toString()).toBe("0.00013");
	});

	it("charges nothing for no tokens", () => {
		expect(TokenRate.fromUsdPerToken(1e-7).costOf(0).isZero).toBe(true);
	});

	it("is free when the catalog says the rate is zero", () => {
		expect(TokenRate.fromUsdPerToken(0).isZero).toBe(true);
		expect(TokenRate.zero().costOf(1_000).isZero).toBe(true);
	});

	it("refuses a rate that is negative or not a number", () => {
		expect(() => TokenRate.fromUsdPerToken(-1e-7)).toThrow(NegativeAmountError);
		expect(() => TokenRate.fromUsdPerToken(Number.NaN)).toThrow(NegativeAmountError);
		expect(() => TokenRate.fromUsdPerToken(Number.POSITIVE_INFINITY)).toThrow(NegativeAmountError);
		expect(() => TokenRate.ofPico(-1n)).toThrow(NegativeAmountError);
	});

	it("compares by the rate and not by the instance", () => {
		expect(TokenRate.ofPico(5n).equals(TokenRate.ofPico(5n))).toBe(true);
		expect(TokenRate.ofPico(5n).equals(TokenRate.ofPico(6n))).toBe(false);
	});
});
