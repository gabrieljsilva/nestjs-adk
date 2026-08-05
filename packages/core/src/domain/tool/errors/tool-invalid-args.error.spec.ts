import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ToolInvalidArgsError } from "./tool-invalid-args.error";

describe("ToolInvalidArgsError", () => {
	it("names the tool, how many tries it took and what was wrong last", () => {
		const error = new ToolInvalidArgsError("refund", 2, "orderId is required");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("TOOL_INVALID_ARGS");
		expect(error.message).toContain("refund");
		expect(error.message).toContain("2");
		expect(error.message).toContain("orderId is required");
	});
});
