import { describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { OrderNotFoundError } from "./errors/order-not-found.error";
import { Order } from "./order";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";

describe("OrderService", () => {
	it("answers the order that was asked for", () => {
		const repository = new OrderRepository(new StoreDatabase());
		repository.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		const orders = new OrderService(repository);

		expect(orders.find("A-1042").customer).toBe("Ana");
	});

	it("reads a number a customer typed with spaces around it", () => {
		const repository = new OrderRepository(new StoreDatabase());
		repository.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		const orders = new OrderService(repository);

		expect(orders.find("  A-1042 ").id).toBe("A-1042");
	});

	it("refuses a number nobody was sold", () => {
		const repository = new OrderRepository(new StoreDatabase());
		repository.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		const orders = new OrderService(repository);

		expect(() => orders.find("A-9")).toThrow(OrderNotFoundError);
	});
});
