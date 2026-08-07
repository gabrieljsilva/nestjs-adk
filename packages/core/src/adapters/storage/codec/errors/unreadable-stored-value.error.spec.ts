import { describe, expect, it } from "vitest";
import { UnreadableStoredValueError } from "./unreadable-stored-value.error";

describe("UnreadableStoredValueError", () => {
	it("says which column held something this build cannot map", () => {
		const error = new UnreadableStoredValueError("status", "hibernating");

		expect(error.code).toBe("UNREADABLE_STORED_VALUE");
		expect(error.message).toContain("status");
		expect(error.message).toContain("hibernating");
	});
});
