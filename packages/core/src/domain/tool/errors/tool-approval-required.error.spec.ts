import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ToolApprovalRequiredError } from "./tool-approval-required.error";

describe("ToolApprovalRequiredError", () => {
	it("names the call that was stopped and why it was stopped", () => {
		const error = new ToolApprovalRequiredError("refund", "c-1", "destructive");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("TOOL_APPROVAL_REQUIRED");
		expect(error.message).toContain("refund");
		expect(error.message).toContain("c-1");
		expect(error.message).toContain("destructive");
	});
});
