import { Clock, IdGenerator, Instant } from "@nestjs-adk/core";
import { beforeEach, describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { AftersalesController } from "./aftersales.controller";
import { OrderNotFoundError } from "./errors/order-not-found.error";
import { RefundRefusedError } from "./errors/refund-refused.error";
import { FindOrderUseCase } from "./find-order.use-case";
import { IssueRefundUseCase } from "./issue-refund.use-case";
import { OpenTicketUseCase } from "./open-ticket.use-case";
import { Order } from "./order";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";
import { RefundLimitUseCase } from "./refund-limit.use-case";
import { RefundPolicy } from "./refund-policy";
import { RefundService } from "./refund.service";
import { TicketRepository } from "./ticket.repository";
import { TicketService } from "./ticket.service";

class FixedIds extends IdGenerator {
	public next(): string {
		return "1";
	}
}

class FixedClock extends Clock {
	public now(): Instant {
		return Instant.fromIso("2026-08-05T12:00:00.000Z");
	}
}

let controller: AftersalesController;

beforeEach(() => {
	const database = new StoreDatabase();
	const repository = new OrderRepository(database);
	repository.save(Order.of("A-1042", "Ana", "Controle", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
	repository.save(Order.of("B-2071", "Bruno", "Headset", 18_900, "silver", "2026-06-26T12:00:00.000Z", "delivered"));
	const orders = new OrderService(repository);
	const clock = new FixedClock();
	const refunds = new RefundService(orders, repository, new RefundPolicy(), clock);
	controller = new AftersalesController(
		new FindOrderUseCase(orders),
		new OpenTicketUseCase(new TicketService(orders, new TicketRepository(database), new FixedIds(), clock)),
		new RefundLimitUseCase(refunds),
		new IssueRefundUseCase(refunds),
	);
});

describe("AftersalesController", () => {
	it("answers an order by its number", () => {
		expect(controller.order("A-1042").customer).toBe("Ana");
	});

	it("answers the ceiling of a plan", () => {
		expect(controller.limit("gold")).toBe(143_700);
	});

	it("opens a ticket, with no conversation behind it", () => {
		const ticket = controller.open("A-1042", "controle quebrado");

		expect(ticket.orderId).toBe("A-1042");
		expect(ticket.fromConversation).toBe(false);
	});

	it("refunds an order the policy allows", () => {
		expect(controller.refund("A-1042", 34_900).isRefunded).toBe(true);
	});

	it("passes a refusal through instead of answering something", () => {
		expect(() => controller.refund("B-2071", 18_900)).toThrow(RefundRefusedError);
		expect(() => controller.order("A-9")).toThrow(OrderNotFoundError);
	});
});
