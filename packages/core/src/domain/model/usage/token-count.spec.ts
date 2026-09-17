import { describe, expect, it } from "vitest";
import { TokenCount } from "./token-count";

describe("TokenCount", () => {
	it("carries a measured number of tokens", () => {
		expect(TokenCount.measured(120).tokens).toBe(120);
	});

	it("truncates fractions and refuses negatives", () => {
		expect(TokenCount.measured(10.9).tokens).toBe(10);
		expect(TokenCount.measured(-5).tokens).toBe(0);
	});

	it("adds up", () => {
		expect(TokenCount.measured(100).plus(TokenCount.measured(40)).tokens).toBe(140);
	});

	it("offers no way to build an estimate, which is what keeps a guess out of a budget", () => {
		expect(Reflect.get(TokenCount, "estimate")).toBeUndefined();
	});
});
