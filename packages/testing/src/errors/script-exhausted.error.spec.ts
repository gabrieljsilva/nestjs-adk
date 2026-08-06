import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ScriptExhaustedError } from "./script-exhausted.error";

describe("ScriptExhaustedError", () => {
	it("names the script and how much of it was played", () => {
		const error = new ScriptExhaustedError("billing", 3);

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("SCRIPT_EXHAUSTED");
		expect(error.model).toBe("billing");
		expect(error.played).toBe(3);
		expect(error.message).toContain("billing");
		expect(error.message).toContain("3");
	});
});
