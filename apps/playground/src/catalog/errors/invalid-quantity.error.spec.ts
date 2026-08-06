import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { InvalidQuantityError } from "./invalid-quantity.error";

describe("InvalidQuantityError", () => {
	it("names the number that was refused", () => {
		expect(new InvalidQuantityError(0).received).toBe(0);
		expect(new InvalidQuantityError(-2).message).toContain("-2");
	});

	it("is an AdkError with a code a caller can branch on", () => {
		expect(new InvalidQuantityError(0)).toBeInstanceOf(AdkError);
		expect(new InvalidQuantityError(0).code).toBe("PLAYGROUND_INVALID_QUANTITY");
	});
});
