import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { RefundRefusedError } from "./refund-refused.error";

describe("RefundRefusedError", () => {
	it("repeats the reason the policy gave", () => {
		const error = new RefundRefusedError("A-1042", "the refund window of 7 days has passed");

		expect(error.orderId).toBe("A-1042");
		expect(error.reason).toBe("the refund window of 7 days has passed");
		expect(error.message).toContain("the refund window of 7 days has passed");
	});

	it("is an AdkError with a code a caller can branch on", () => {
		expect(new RefundRefusedError("A-1042", "no")).toBeInstanceOf(AdkError);
		expect(new RefundRefusedError("A-1042", "no").code).toBe("PLAYGROUND_REFUND_REFUSED");
	});
});
