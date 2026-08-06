import { describe, expect, it } from "vitest";
import { RefundDecision } from "./refund-decision";

describe("RefundDecision", () => {
	it("allows, and says under which limit", () => {
		const decision = RefundDecision.allowed(143_700);

		expect(decision.allowed).toBe(true);
		expect(decision.limitCents).toBe(143_700);
		expect(decision.limitBrl).toBe(1437);
		expect(decision.reason).toContain("limit");
	});

	it("refuses with the reason a customer is told", () => {
		const decision = RefundDecision.refused("the refund window of 7 days has passed", 47_500);

		expect(decision.allowed).toBe(false);
		expect(decision.reason).toBe("the refund window of 7 days has passed");
		expect(decision.limitBrl).toBe(475);
	});
});
