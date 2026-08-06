import { Instant } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { Order } from "./order";
import { RefundPolicy } from "./refund-policy";

const NOW = Instant.fromIso("2026-08-05T12:00:00.000Z");
const TWO_DAYS_AGO = "2026-08-03T12:00:00.000Z";
const FORTY_DAYS_AGO = "2026-06-26T12:00:00.000Z";

function order(plan: string, deliveredOn: string, totalCents = 34_900, refundedCents = 0): Order {
	return Order.of("A-1042", "Ana", "Controle", totalCents, plan, deliveredOn, "delivered", refundedCents);
}

const policy = new RefundPolicy();

describe("RefundPolicy", () => {
	it("holds a ceiling per plan", () => {
		expect(policy.limitCentsFor("gold")).toBe(143_700);
		expect(policy.limitCentsFor("SILVER")).toBe(47_500);
		expect(policy.limitCentsFor("bronze")).toBe(9_900);
	});

	it("gives an unknown plan the smallest ceiling", () => {
		expect(policy.limitCentsFor("platinum")).toBe(9_900);
	});

	it("allows a refund inside the window and under the ceiling", () => {
		expect(policy.decide(order("gold", TWO_DAYS_AGO), 34_900, NOW).allowed).toBe(true);
	});

	it("refuses after the window has passed", () => {
		const decision = policy.decide(order("gold", FORTY_DAYS_AGO), 34_900, NOW);

		expect(decision.allowed).toBe(false);
		expect(decision.reason).toContain("7 days");
	});

	it("refuses more than the order was worth", () => {
		expect(policy.decide(order("gold", TWO_DAYS_AGO), 40_000, NOW).allowed).toBe(false);
	});

	it("refuses above the plan ceiling", () => {
		const decision = policy.decide(order("bronze", TWO_DAYS_AGO), 34_900, NOW);

		expect(decision.allowed).toBe(false);
		expect(decision.reason).toContain("bronze");
	});

	it("refuses an order that was already refunded", () => {
		const decision = policy.decide(order("gold", TWO_DAYS_AGO, 34_900, 34_900), 34_900, NOW);

		expect(decision.allowed).toBe(false);
		expect(decision.reason).toContain("already");
	});

	it("refuses a refund worth nothing", () => {
		expect(policy.decide(order("gold", TWO_DAYS_AGO), 0, NOW).allowed).toBe(false);
	});
});
