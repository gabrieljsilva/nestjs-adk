import { beforeEach, describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { OrderNotFoundError } from "./errors/order-not-found.error";
import { FindOrderUseCase } from "./find-order.use-case";
import { Order } from "./order";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";

let useCase: FindOrderUseCase;

beforeEach(() => {
	const orders = new OrderRepository(new StoreDatabase());
	orders.save(Order.of("A-1042", "Ana", "Controle", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
	useCase = new FindOrderUseCase(new OrderService(orders));
});

describe("FindOrderUseCase", () => {
	it("answers the order", () => {
		expect(useCase.execute("A-1042").product).toBe("Controle");
	});

	it("passes the refusal through", () => {
		expect(() => useCase.execute("A-9")).toThrow(OrderNotFoundError);
	});
});
