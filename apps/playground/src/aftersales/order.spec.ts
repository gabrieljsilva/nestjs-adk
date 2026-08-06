import { Instant } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { Order } from "./order";

const DELIVERED = "2026-08-01T12:00:00.000Z";

function orderDelivered(): Order {
	return Order.of("A-1042", "Ana Ribeiro", "Controle sem fio Nitro X", 34_900, "gold", DELIVERED, "delivered");
}

describe("Order", () => {
	it("reads money in reais and keeps it in centavos", () => {
		expect(orderDelivered().totalCents).toBe(34_900);
		expect(orderDelivered().totalBrl).toBe(349);
	});

	it("counts whole days since delivery", () => {
		const now = Instant.fromIso("2026-08-05T18:00:00.000Z");

		expect(orderDelivered().daysSinceDelivery(now)).toBe(4);
	});

	it("counts zero on the day it was delivered", () => {
		expect(orderDelivered().daysSinceDelivery(Instant.fromIso("2026-08-01T23:00:00.000Z"))).toBe(0);
	});

	it("is not refunded until something was given back", () => {
		expect(orderDelivered().isRefunded).toBe(false);
		expect(orderDelivered().refunded(34_900).isRefunded).toBe(true);
	});

	it("keeps everything but the status and the amount when it is refunded", () => {
		const refunded = orderDelivered().refunded(34_900);

		expect(refunded.status).toBe("refunded");
		expect(refunded.refundedCents).toBe(34_900);
		expect(refunded.id).toBe("A-1042");
		expect(refunded.totalCents).toBe(34_900);
	});
});
