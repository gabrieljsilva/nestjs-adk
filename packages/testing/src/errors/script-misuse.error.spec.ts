import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ScriptMisuseError } from "./script-misuse.error";

describe("ScriptMisuseError", () => {
	it("names the script and what was attempted on it", () => {
		const error = new ScriptMisuseError("sales", "guard a turn that was never queued");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("SCRIPT_MISUSE");
		expect(error.message).toContain("sales");
		expect(error.message).toContain("guard a turn");
	});
});
