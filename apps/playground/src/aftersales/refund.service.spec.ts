import { Clock, Instant } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { OrderNotFoundError } from "./errors/order-not-found.error";
import { RefundRefusedError } from "./errors/refund-refused.error";
import { Order } from "./order";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";
import { RefundPolicy } from "./refund-policy";
import { RefundService } from "./refund.service";

class FixedClock extends Clock {
	public now(): Instant {
		return Instant.fromIso("2026-08-05T12:00:00.000Z");
	}
}

describe("RefundService", () => {
	it("answers the ceiling of a plan", () => {
		const orders = new OrderRepository(new StoreDatabase());
		orders.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		orders.save(Order.of("B-2071", "Bruno", "Headset", 18_900, "silver", "2026-06-26T12:00:00.000Z", "delivered"));
		const refunds = new RefundService(new OrderService(orders), orders, new RefundPolicy(), new FixedClock());

		expect(refunds.limitCentsFor("gold")).toBe(143_700);
	});

	it("says what would happen without anything happening", () => {
		const orders = new OrderRepository(new StoreDatabase());
		orders.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		orders.save(Order.of("B-2071", "Bruno", "Headset", 18_900, "silver", "2026-06-26T12:00:00.000Z", "delivered"));
		const refunds = new RefundService(new OrderService(orders), orders, new RefundPolicy(), new FixedClock());

		expect(refunds.decide("A-1042", 34_900).allowed).toBe(true);
		expect(orders.findById("A-1042")?.isRefunded).toBe(false);
	});

	it("records the refund against the order when the policy allows it", () => {
		const orders = new OrderRepository(new StoreDatabase());
		orders.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		orders.save(Order.of("B-2071", "Bruno", "Headset", 18_900, "silver", "2026-06-26T12:00:00.000Z", "delivered"));
		const refunds = new RefundService(new OrderService(orders), orders, new RefundPolicy(), new FixedClock());

		const refunded = refunds.issue("A-1042", 34_900);

		expect(refunded.isRefunded).toBe(true);
		expect(orders.findById("A-1042")?.refundedCents).toBe(34_900);
	});

	it("refuses with the reason the policy gave, and nothing is written", () => {
		const orders = new OrderRepository(new StoreDatabase());
		orders.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		orders.save(Order.of("B-2071", "Bruno", "Headset", 18_900, "silver", "2026-06-26T12:00:00.000Z", "delivered"));
		const refunds = new RefundService(new OrderService(orders), orders, new RefundPolicy(), new FixedClock());

		expect(() => refunds.issue("B-2071", 18_900)).toThrow(RefundRefusedError);
		expect(orders.findById("B-2071")?.isRefunded).toBe(false);
	});

	it("refuses to refund the same order twice", () => {
		const orders = new OrderRepository(new StoreDatabase());
		orders.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		orders.save(Order.of("B-2071", "Bruno", "Headset", 18_900, "silver", "2026-06-26T12:00:00.000Z", "delivered"));
		const refunds = new RefundService(new OrderService(orders), orders, new RefundPolicy(), new FixedClock());

		refunds.issue("A-1042", 34_900);

		expect(() => refunds.issue("A-1042", 34_900)).toThrow(RefundRefusedError);
	});

	it("refuses an order nobody was sold", () => {
		const orders = new OrderRepository(new StoreDatabase());
		orders.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		orders.save(Order.of("B-2071", "Bruno", "Headset", 18_900, "silver", "2026-06-26T12:00:00.000Z", "delivered"));
		const refunds = new RefundService(new OrderService(orders), orders, new RefundPolicy(), new FixedClock());

		expect(() => refunds.issue("A-9", 100)).toThrow(OrderNotFoundError);
	});
});
