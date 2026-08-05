import { describe, expect, it } from "vitest";
import { CacheReport } from "./cache-report";

describe("CacheReport", () => {
	it("is unavailable rather than zero when no provider said anything", () => {
		const report = CacheReport.unavailable(3);

		expect(report.available).toBe(false);
		expect(report.silentRuns).toBe(3);
		expect(report.ratio).toBe(0);
	});

	it("divides what was cached by what was sent", () => {
		const report = new CacheReport(750, 1000, 2, 0);

		expect(report.available).toBe(true);
		expect(report.ratio).toBe(0.75);
	});

	it("never divides by zero when the sample had no prompt tokens", () => {
		expect(new CacheReport(0, 0, 1, 0).ratio).toBe(0);
	});
});
