import { describe, expect, it } from "vitest";
import { ModelUsage } from "./model-usage";

describe("ModelUsage", () => {
	it("carries what the call consumed", () => {
		const usage = ModelUsage.of(100, 40);

		expect(usage.inputTokens).toBe(100);
		expect(usage.outputTokens).toBe(40);
		expect(usage.totalTokens).toBe(140);
	});

	it("counts cached input apart, because it is billed apart", () => {
		const usage = ModelUsage.of(100, 40, 80);

		expect(usage.cachedInputTokens).toBe(80);
		expect(usage.freshInputTokens).toBe(20);
	});

	it("never reports more cached input than input", () => {
		expect(ModelUsage.of(50, 10, 900).cachedInputTokens).toBe(50);
	});

	it("truncates fractions and refuses negatives", () => {
		const usage = ModelUsage.of(10.9, -5);

		expect(usage.inputTokens).toBe(10);
		expect(usage.outputTokens).toBe(0);
	});

	it("reports nothing consumed when a provider never said", () => {
		expect(ModelUsage.none().totalTokens).toBe(0);
	});

	it("adds up across calls, keeping the cached share", () => {
		const total = ModelUsage.of(100, 40, 80).plus(ModelUsage.of(50, 20, 10));

		expect(total.inputTokens).toBe(150);
		expect(total.outputTokens).toBe(60);
		expect(total.cachedInputTokens).toBe(90);
	});
});
