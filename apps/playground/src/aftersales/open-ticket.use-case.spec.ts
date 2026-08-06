import { Clock, IdGenerator, Instant } from "@nestjs-adk/core";
import { beforeEach, describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { OrderNotFoundError } from "./errors/order-not-found.error";
import { OpenTicketUseCase } from "./open-ticket.use-case";
import { Order } from "./order";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";
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

let useCase: OpenTicketUseCase;

beforeEach(() => {
	const database = new StoreDatabase();
	const orders = new OrderRepository(database);
	orders.save(Order.of("A-1042", "Ana", "Controle", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
	const tickets = new TicketService(
		new OrderService(orders),
		new TicketRepository(database),
		new FixedIds(),
		new FixedClock(),
	);
	useCase = new OpenTicketUseCase(tickets);
});

describe("OpenTicketUseCase", () => {
	it("opens the ticket and answers it", () => {
		const ticket = useCase.execute("A-1042", "quebrado", "session-9");

		expect(ticket.id).toBe("T-1");
		expect(ticket.sessionId).toBe("session-9");
	});

	it("passes the refusal through", () => {
		expect(() => useCase.execute("A-9", "quebrado")).toThrow(OrderNotFoundError);
	});
});
