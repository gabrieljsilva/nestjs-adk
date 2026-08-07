import { Instant } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { Order } from "./order";
import { RefundPolicy } from "./refund-policy";

describe("RefundPolicy", () => {
	it("holds a ceiling per plan", () => {
		const policy = new RefundPolicy();
		expect(policy.limitCentsFor("gold")).toBe(143_700);
		expect(policy.limitCentsFor("SILVER")).toBe(47_500);
		expect(policy.limitCentsFor("bronze")).toBe(9_900);
	});

	it("gives an unknown plan the smallest ceiling", () => {
		const policy = new RefundPolicy();
		expect(policy.limitCentsFor("platinum")).toBe(9_900);
	});

	it("allows a refund inside the window and under the ceiling", () => {
		const now = Instant.fromIso("2026-08-05T12:00:00.000Z");
		const policy = new RefundPolicy();
		expect(
			policy.decide(
				Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"),
				34_900,
				now,
			).allowed,
		).toBe(true);
	});

	it("refuses after the window has passed", () => {
		const now = Instant.fromIso("2026-08-05T12:00:00.000Z");
		const policy = new RefundPolicy();
		const decision = policy.decide(
			Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-06-26T12:00:00.000Z", "delivered"),
			34_900,
			now,
		);

		expect(decision.allowed).toBe(false);
		expect(decision.reason).toContain("7 days");
	});

	it("refuses more than the order was worth", () => {
		const now = Instant.fromIso("2026-08-05T12:00:00.000Z");
		const policy = new RefundPolicy();
		expect(
			policy.decide(
				Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"),
				40_000,
				now,
			).allowed,
		).toBe(false);
	});

	it("refuses above the plan ceiling", () => {
		const now = Instant.fromIso("2026-08-05T12:00:00.000Z");
		const policy = new RefundPolicy();
		const decision = policy.decide(
			Order.of("A-1042", "Ana", "Controller", 34_900, "bronze", "2026-08-03T12:00:00.000Z", "delivered"),
			34_900,
			now,
		);

		expect(decision.allowed).toBe(false);
		expect(decision.reason).toContain("bronze");
	});

	it("refuses an order that was already refunded", () => {
		const now = Instant.fromIso("2026-08-05T12:00:00.000Z");
		const policy = new RefundPolicy();
		const decision = policy.decide(
			Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered", 34_900),
			34_900,
			now,
		);

		expect(decision.allowed).toBe(false);
		expect(decision.reason).toContain("already");
	});

	it("refuses a refund worth nothing", () => {
		const now = Instant.fromIso("2026-08-05T12:00:00.000Z");
		const policy = new RefundPolicy();
		expect(
			policy.decide(
				Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"),
				0,
				now,
			).allowed,
		).toBe(false);
	});
});
