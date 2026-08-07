import { Instant } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { Order } from "./order";

describe("Order", () => {
	it("reads money in reais and keeps it in centavos", () => {
		const order = Order.of(
			"A-1042",
			"Ana Ribeiro",
			"Nitro X Wireless Controller",
			34_900,
			"gold",
			"2026-08-01T12:00:00.000Z",
			"delivered",
		);

		expect(order.totalCents).toBe(34_900);
		expect(order.totalBrl).toBe(349);
	});

	it("counts whole days since delivery", () => {
		const order = Order.of(
			"A-1042",
			"Ana Ribeiro",
			"Nitro X Wireless Controller",
			34_900,
			"gold",
			"2026-08-01T12:00:00.000Z",
			"delivered",
		);

		const now = Instant.fromIso("2026-08-05T18:00:00.000Z");

		expect(order.daysSinceDelivery(now)).toBe(4);
	});

	it("counts zero on the day it was delivered", () => {
		const order = Order.of(
			"A-1042",
			"Ana Ribeiro",
			"Nitro X Wireless Controller",
			34_900,
			"gold",
			"2026-08-01T12:00:00.000Z",
			"delivered",
		);

		expect(order.daysSinceDelivery(Instant.fromIso("2026-08-01T23:00:00.000Z"))).toBe(0);
	});

	it("is not refunded until something was given back", () => {
		const order = Order.of(
			"A-1042",
			"Ana Ribeiro",
			"Nitro X Wireless Controller",
			34_900,
			"gold",
			"2026-08-01T12:00:00.000Z",
			"delivered",
		);

		expect(order.isRefunded).toBe(false);
		expect(order.refunded(34_900).isRefunded).toBe(true);
	});

	it("keeps everything but the status and the amount when it is refunded", () => {
		const order = Order.of(
			"A-1042",
			"Ana Ribeiro",
			"Nitro X Wireless Controller",
			34_900,
			"gold",
			"2026-08-01T12:00:00.000Z",
			"delivered",
		);

		const refunded = order.refunded(34_900);

		expect(refunded.status).toBe("refunded");
		expect(refunded.refundedCents).toBe(34_900);
		expect(refunded.id).toBe("A-1042");
		expect(refunded.totalCents).toBe(34_900);
	});
});
