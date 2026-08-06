import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { InvalidRowError } from "./invalid-row.error";

describe("InvalidRowError", () => {
	it("names the column and what was expected of it", () => {
		const error = new InvalidRowError("total_cents", "an integer");

		expect(error.column).toBe("total_cents");
		expect(error.expected).toBe("an integer");
		expect(error.message).toBe("Column total_cents does not hold an integer.");
	});

	it("is an AdkError with a code a caller can branch on", () => {
		expect(new InvalidRowError("name", "text")).toBeInstanceOf(AdkError);
		expect(new InvalidRowError("name", "text").code).toBe("PLAYGROUND_INVALID_ROW");
	});
});
