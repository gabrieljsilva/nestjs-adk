import { beforeEach, describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { Order } from "./order";
import { OrderRepository } from "./order.repository";

const order = Order.of("A-1042", "Ana", "Controle", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered");

let orders: OrderRepository;

beforeEach(() => {
	orders = new OrderRepository(new StoreDatabase());
	orders.save(order);
});

describe("OrderRepository", () => {
	it("reads back every column it wrote", () => {
		expect(orders.findById("A-1042")).toEqual(order);
	});

	it("answers undefined for a number the store does not have", () => {
		expect(orders.findById("A-9")).toBeUndefined();
	});

	it("records the refund against the order", () => {
		const refunded = orders.markRefunded(order, 34_900);

		expect(refunded.refundedCents).toBe(34_900);
		const stored = orders.findById("A-1042");

		expect(stored?.status).toBe("refunded");
		expect(stored?.refundedCents).toBe(34_900);
		expect(stored?.isRefunded).toBe(true);
	});

	it("keeps the first write when the same order is seeded twice", () => {
		orders.save(Order.of("A-1042", "Outro", "Outro", 1, "bronze", "2020-01-01T00:00:00.000Z", "delivered"));

		expect(orders.findById("A-1042")?.customer).toBe("Ana");
	});
});
