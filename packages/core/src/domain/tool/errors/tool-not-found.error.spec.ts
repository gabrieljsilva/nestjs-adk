import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ToolNotFoundError } from "./tool-not-found.error";

describe("ToolNotFoundError", () => {
	it("names what was asked for and what was on offer", () => {
		const error = new ToolNotFoundError("refunds", ["refund", "lookup"]);

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("TOOL_NOT_FOUND");
		expect(error.message).toContain("refunds");
		expect(error.message).toContain("refund, lookup");
	});

	it("says so plainly when the agent offers nothing", () => {
		expect(new ToolNotFoundError("refund", []).message).toContain("no tools");
	});
});
