import type { TokenUsage } from "../types/events";
import { cacheHitRatio } from "./cache-ratio";

function usage(promptTokens: number, cachedTokens?: number): TokenUsage {
	return {
		promptTokens,
		outputTokens: 10,
		totalTokens: promptTokens + 10,
		...(cachedTokens != null && { cachedTokens }),
	};
}

describe("cacheHitRatio", () => {
	it("drops the warm-up run: only the runs that could hit the cache are measured", () => {
		const report = cacheHitRatio([usage(1000, 0), usage(1000, 800), usage(1000, 800)]);

		expect(report.sampledRuns).toBe(2);
		expect(report.promptTokens).toBe(2000);
		expect(report.cachedTokens).toBe(1600);
		expect(report.ratio).toBeCloseTo(0.8, 10);
	});

	it("a provider that never reports cached tokens is UNKNOWN, not zero", () => {
		const report = cacheHitRatio([usage(1000), usage(1000), usage(1000)]);

		expect(report.available).toBe(false);
		expect(report.cachedTokens).toBe(0);
	});

	it("a reported zero is a real miss and stays available", () => {
		const report = cacheHitRatio([usage(1000, 0), usage(1000, 0)]);

		expect(report.available).toBe(true);
		expect(report.ratio).toBe(0);
	});

	it("the warm-up being the only run reporting cache does not make the sample available", () => {
		const report = cacheHitRatio([usage(1000, 900), usage(1000), usage(1000)]);

		expect(report.available).toBe(false);
		expect(report.cachedTokens).toBe(0);
	});

	it("a silent run leaves the sample entirely, instead of being counted as zero cached", () => {
		const report = cacheHitRatio([usage(1000, 0), usage(1000, 600), usage(1000)]);

		// counting the silent run in the denominator would report 30% for a cache that served 60%
		expect(report.ratio).toBeCloseTo(0.6, 10);
		expect(report.promptTokens).toBe(1000);
		expect(report.cachedTokens).toBe(600);
		expect(report.sampledRuns).toBe(1);
		expect(report.silentRuns).toBe(1);
	});

	it("zero prompt tokens do not divide by zero", () => {
		const report = cacheHitRatio([usage(0, 0), usage(0, 0)]);

		expect(report.ratio).toBe(0);
	});

	it("refuses a sample without a warm-up plus at least one measured run", () => {
		expect(() => cacheHitRatio([usage(1000, 500)])).toThrow(/at least 2 runs/);
	});
});
