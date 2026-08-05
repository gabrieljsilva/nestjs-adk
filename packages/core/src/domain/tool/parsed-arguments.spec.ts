import { describe, expect, it } from "vitest";
import { ParsedArguments } from "./parsed-arguments";

describe("ParsedArguments", () => {
	it("carries the values when the parse succeeded", () => {
		const parsed = ParsedArguments.valid({ orderId: "42" });

		expect(parsed.isValid).toBe(true);
		expect(parsed.values.orderId).toBe("42");
	});

	it("carries a reason the model can act on when it did not", () => {
		const parsed = ParsedArguments.invalid("orderId is required");

		expect(parsed.isValid).toBe(false);
		expect(parsed.reason).toBe("orderId is required");
	});

	it("has no half parsed shape: an invalid parse produced no values", () => {
		expect(ParsedArguments.invalid("orderId is required").values).toEqual({});
	});
});
