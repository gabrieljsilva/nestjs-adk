import { describe, expect, it } from "vitest";
import { JudgeRubric } from "./judge-rubric.value-object";

describe("JudgeRubric", () => {
	it("keeps the criteria and defaults the bar to a clear majority", () => {
		const rubric = new JudgeRubric("  names the order id  ");

		expect(rubric.criteria).toBe("names the order id");
		expect(rubric.threshold).toBe(0.7);
	});

	it("passes a score at the bar and above it", () => {
		const rubric = new JudgeRubric("names the order id", 0.8);

		expect(rubric.passes(0.8)).toBe(true);
		expect(rubric.passes(0.81)).toBe(true);
		expect(rubric.passes(0.79)).toBe(false);
	});

	it("keeps the bar inside the scale a score can reach", () => {
		expect(new JudgeRubric("x", 5).threshold).toBe(1);
		expect(new JudgeRubric("x", -2).threshold).toBe(0);
	});
});
