import { describe, expect, it } from "vitest";
import { JudgeVerdict } from "./judge-verdict";

describe("JudgeVerdict", () => {
	it("carries the decision, the score and why", () => {
		const verdict = JudgeVerdict.of(true, 0.9, "  it names the order  ");

		expect(verdict.passed).toBe(true);
		expect(verdict.score).toBe(0.9);
		expect(verdict.reason).toBe("it names the order");
	});

	it("keeps a score inside the scale, whatever the judge answered", () => {
		expect(JudgeVerdict.of(true, 7, "").score).toBe(1);
		expect(JudgeVerdict.of(false, -3, "").score).toBe(0);
	});
});
