import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { InvalidCompactionThresholdError } from "./invalid-compaction-threshold.error";

describe("InvalidCompactionThresholdError", () => {
	it("carries a stable code", () => {
		expect(new InvalidCompactionThresholdError(1000, 1200).code).toBe("CONTEXT_INVALID_COMPACTION_THRESHOLD");
	});

	it("states both numbers that disagree", () => {
		const error = new InvalidCompactionThresholdError(1000, 1200);

		expect(error.message).toContain("1000");
		expect(error.message).toContain("1200");
	});

	it("is an adk error", () => {
		expect(new InvalidCompactionThresholdError(1000, 1200)).toBeInstanceOf(AdkError);
	});
});
