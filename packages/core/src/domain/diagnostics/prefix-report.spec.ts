import { describe, expect, it } from "vitest";
import { PrefixDivergence } from "./prefix-divergence";
import { PrefixReport } from "./prefix-report";

describe("PrefixReport", () => {
	it("measures the shared opening against the largest context compared", () => {
		const report = new PrefixReport(50, 200, new PrefixDivergence("conversation", 50, 0, ["a", "b"]));

		expect(report.ratio).toBe(0.25);
		expect(report.isIdentical).toBe(false);
	});

	it("calls two empty contexts identical rather than dividing by zero", () => {
		const report = new PrefixReport(0, 0);

		expect(report.ratio).toBe(1);
		expect(report.isIdentical).toBe(true);
	});
});
