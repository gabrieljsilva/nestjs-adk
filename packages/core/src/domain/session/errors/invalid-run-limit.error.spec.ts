import { describe, expect, it } from "vitest";
import { InvalidRunLimitError } from "./invalid-run-limit.error";

describe("InvalidRunLimitError", () => {
	it("names the limit and the value, so the fix is where the declaration is", () => {
		const error = new InvalidRunLimitError("maxIterations", -1);

		expect(error.code).toBe("INVALID_RUN_LIMIT");
		expect(error.message).toContain("maxIterations");
		expect(error.message).toContain("-1");
	});
});
