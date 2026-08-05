import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ToolRepeatedFailureError } from "./tool-repeated-failure.error";

describe("ToolRepeatedFailureError", () => {
	it("names the tool, how many times it failed and why it failed last", () => {
		const error = new ToolRepeatedFailureError("lookup", 3, "connection refused");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("TOOL_REPEATED_FAILURE");
		expect(error.message).toContain("lookup");
		expect(error.message).toContain("3");
		expect(error.message).toContain("connection refused");
	});
});
