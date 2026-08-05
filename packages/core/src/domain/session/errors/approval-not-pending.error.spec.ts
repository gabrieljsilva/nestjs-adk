import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ApprovalNotPendingError } from "./approval-not-pending.error";

describe("ApprovalNotPendingError", () => {
	it("names the session and the call whose decision arrived too late", () => {
		const error = new ApprovalNotPendingError("s-1", "c-1");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("APPROVAL_NOT_PENDING");
		expect(error.message).toContain("s-1");
		expect(error.message).toContain("c-1");
	});
});
