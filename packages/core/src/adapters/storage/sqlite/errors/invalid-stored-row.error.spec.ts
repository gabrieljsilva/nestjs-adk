import { describe, expect, it } from "vitest";
import { InvalidStoredRowError } from "./invalid-stored-row.error";

describe("InvalidStoredRowError", () => {
	it("names the column and what was expected there", () => {
		const error = new InvalidStoredRowError("revision", "integer");

		expect(error.code).toBe("INVALID_STORED_ROW");
		expect(error.message).toContain("revision");
		expect(error.message).toContain("integer");
	});
});
