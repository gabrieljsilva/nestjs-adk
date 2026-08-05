import { describe, expect, it } from "vitest";
import { NotEnoughRunsError } from "./not-enough-runs.error";

describe("NotEnoughRunsError", () => {
	it("says how many runs it needed and why", () => {
		const error = new NotEnoughRunsError(1, 2);

		expect(error.code).toBe("NOT_ENOUGH_RUNS");
		expect(error.message).toContain("warms the cache");
	});
});
