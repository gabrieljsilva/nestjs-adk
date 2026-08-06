import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ScriptNotConsumedError } from "./script-not-consumed.error";

describe("ScriptNotConsumedError", () => {
	it("says how many turns nobody played", () => {
		const error = new ScriptNotConsumedError("warranty", 2);

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("SCRIPT_NOT_CONSUMED");
		expect(error.pending).toBe(2);
		expect(error.message).toContain("warranty");
	});
});
