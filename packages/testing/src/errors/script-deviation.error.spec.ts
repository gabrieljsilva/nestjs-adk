import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ScriptDeviationError } from "./script-deviation.error";

describe("ScriptDeviationError", () => {
	it("shows the turn, what it demanded and what arrived instead", () => {
		const error = new ScriptDeviationError("sales", 2, 'a request mentioning "A-1042"', '{"messages":["hello"]}');

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("SCRIPT_DEVIATION");
		expect(error.turn).toBe(2);
		expect(error.message).toContain("sales");
		expect(error.message).toContain("A-1042");
		expect(error.message).toContain("hello");
	});
});
