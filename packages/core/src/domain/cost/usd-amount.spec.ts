import { describe, expect, it } from "vitest";
import { NegativeAmountError } from "./errors/negative-amount.error";
import { UsdAmount } from "./usd-amount";

describe("UsdAmount", () => {
	it("starts at nothing", () => {
		expect(UsdAmount.zero().isZero).toBe(true);
		expect(UsdAmount.zero().toString()).toBe("0");
	});

	it("adds without losing a digit", () => {
		const total = UsdAmount.ofPico(1n).plus(UsdAmount.ofPico(2n)).plus(UsdAmount.ofPico(7n));

		expect(total.pico).toBe(10n);
	});

	/**
	 * The reason this class holds integers.
	 *
	 * `0.1 + 0.2` in float is `0.30000000000000004`, and a run that bills a hundred calls
	 * carries that error into the total. Summed as integers it is the number it should be.
	 */
	it("sums the case that drifts in float", () => {
		const tenth = UsdAmount.ofPico(100_000_000_000n);
		const fifth = UsdAmount.ofPico(200_000_000_000n);

		expect(tenth.plus(fifth).toString()).toBe("0.3");
		expect(0.1 + 0.2).not.toBe(0.3);
	});

	it("multiplies by a token count", () => {
		expect(UsdAmount.ofPico(100_000n).times(40).pico).toBe(4_000_000n);
		expect(UsdAmount.ofPico(5n).times(0).isZero).toBe(true);
	});

	/** A small agent is the case the precision is for: 40 tokens in and 12 out on a lite model. */
	it("reads a fraction of a cent as an exact decimal, with no exponent", () => {
		const input = UsdAmount.ofPico(100_000n).times(40);
		const output = UsdAmount.ofPico(400_000n).times(12);

		const total = input.plus(output);

		expect(total.pico).toBe(8_800_000n);
		expect(total.toString()).toBe("0.0000088");
		expect(total.toString()).not.toContain("e");
	});

	/** The float ceiling this class exists to clear: `Number.MAX_SAFE_INTEGER` in pico is about 9007 dollars. */
	it("stays exact past the largest amount a float could count", () => {
		const beyond = UsdAmount.ofPico(BigInt(Number.MAX_SAFE_INTEGER) + 1n).plus(UsdAmount.ofPico(1n));

		expect(beyond.pico).toBe(9_007_199_254_740_993n);
		expect(beyond.toString()).toBe("9007.199254740993");
	});

	it("prints a whole number without a decimal point", () => {
		expect(UsdAmount.ofPico(2_000_000_000_000n).toString()).toBe("2");
	});

	it("keeps the leading zeroes of the fraction, which is where a small amount lives", () => {
		expect(UsdAmount.ofPico(1n).toString()).toBe("0.000000000001");
		expect(UsdAmount.ofPico(130n).toString()).toBe("0.00000000013");
	});

	it("answers a float for a log line, and it is the same number", () => {
		expect(UsdAmount.ofPico(8_800_000n).toNumber()).toBeCloseTo(8.8e-6, 15);
	});

	it("refuses an amount below zero where it is built", () => {
		expect(() => UsdAmount.ofPico(-1n)).toThrow(NegativeAmountError);
	});

	it("refuses a token count that is negative or not whole", () => {
		expect(() => UsdAmount.ofPico(1n).times(-1)).toThrow(NegativeAmountError);
		expect(() => UsdAmount.ofPico(1n).times(1.5)).toThrow(NegativeAmountError);
	});

	it("compares by the amount and not by the instance", () => {
		expect(UsdAmount.ofPico(7n).equals(UsdAmount.ofPico(7n))).toBe(true);
		expect(UsdAmount.ofPico(7n).equals(UsdAmount.ofPico(8n))).toBe(false);
	});

	/** The reason this exists: a `bigint` in a response body throws on the way out. */
	it("serializes as the exact decimal string, so a response body survives it", () => {
		expect(JSON.stringify({ amount: UsdAmount.ofPico(8_800_000n) })).toBe('{"amount":"0.0000088"}');
	});
});
