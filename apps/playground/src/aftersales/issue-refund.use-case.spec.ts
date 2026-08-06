import { Clock, Instant } from "@nestjs-adk/core";
import { beforeEach, describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { RefundRefusedError } from "./errors/refund-refused.error";
import { IssueRefundUseCase } from "./issue-refund.use-case";
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

let useCase: IssueRefundUseCase;
let orders: OrderRepository;

beforeEach(() => {
	orders = new OrderRepository(new StoreDatabase());
	orders.save(Order.of("A-1042", "Ana", "Controle", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
	orders.save(Order.of("B-2071", "Bruno", "Headset", 18_900, "silver", "2026-06-26T12:00:00.000Z", "delivered"));
	useCase = new IssueRefundUseCase(
		new RefundService(new OrderService(orders), orders, new RefundPolicy(), new FixedClock()),
	);
});

describe("IssueRefundUseCase", () => {
	it("gives the money back and says so", () => {
		expect(useCase.execute("A-1042", 34_900).isRefunded).toBe(true);
		expect(orders.findById("A-1042")?.status).toBe("refunded");
	});

	it("passes the refusal through, with nothing written", () => {
		expect(() => useCase.execute("B-2071", 18_900)).toThrow(RefundRefusedError);
		expect(orders.findById("B-2071")?.isRefunded).toBe(false);
	});
});
