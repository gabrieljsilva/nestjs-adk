import { describe, expect, it } from "vitest";
import { ModelUsage } from "../../domain/model/model-usage";
import { CacheEfficiency } from "./cache-efficiency";
import { NotEnoughRunsError } from "./errors/not-enough-runs.error";

describe("CacheEfficiency", () => {
	it("refuses a sample too small to mean anything", () => {
		expect(() => new CacheEfficiency().of([ModelUsage.of(100, 10, 0)])).toThrow(NotEnoughRunsError);
	});

	it("drops the first run, because it is what warmed the cache", () => {
		const report = new CacheEfficiency().of([ModelUsage.of(100, 10, 0), ModelUsage.of(100, 10, 80)]);

		expect(report.sampledRuns).toBe(1);
		expect(report.ratio).toBe(0.8);
	});

	it("says unavailable when nobody reported caching, instead of reporting none", () => {
		const report = new CacheEfficiency().of([ModelUsage.of(100, 10), ModelUsage.of(100, 10)]);

		expect(report.available).toBe(false);
		expect(report.silentRuns).toBe(1);
	});

	it("keeps a run that reported zero, because zero is an answer", () => {
		const report = new CacheEfficiency().of([ModelUsage.of(100, 10), ModelUsage.of(100, 10, 0)]);

		expect(report.available).toBe(true);
		expect(report.ratio).toBe(0);
		expect(report.silentRuns).toBe(0);
	});

	it("leaves a silent run out of the denominator entirely", () => {
		const report = new CacheEfficiency().of([
			ModelUsage.of(100, 10),
			ModelUsage.of(100, 10, 50),
			ModelUsage.of(1000, 10),
		]);

		expect(report.promptTokens).toBe(100);
		expect(report.silentRuns).toBe(1);
	});
});
