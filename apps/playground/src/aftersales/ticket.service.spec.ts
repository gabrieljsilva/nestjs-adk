import { Clock, IdGenerator, Instant } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { OrderNotFoundError } from "./errors/order-not-found.error";
import { Order } from "./order";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";
import { TicketRepository } from "./ticket.repository";
import { TicketService } from "./ticket.service";

class CountingIds extends IdGenerator {
	private issued = 0;

	public next(): string {
		this.issued += 1;
		return String(this.issued);
	}
}

class FixedClock extends Clock {
	public now(): Instant {
		return Instant.fromIso("2026-08-05T12:00:00.000Z");
	}
}

describe("TicketService", () => {
	it("opens a ticket against the order, stamped with the time it was opened", () => {
		const database = new StoreDatabase();
		const orders = new OrderRepository(database);
		orders.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		const tickets = new TicketService(
			new OrderService(orders),
			new TicketRepository(database),
			new CountingIds(),
			new FixedClock(),
		);

		const ticket = tickets.open("A-1042", "the controller arrived broken");

		expect(ticket.id).toBe("T-1");
		expect(ticket.orderId).toBe("A-1042");
		expect(ticket.openedAt).toBe("2026-08-05T12:00:00.000Z");
	});

	it("points at the conversation the complaint came out of", () => {
		const database = new StoreDatabase();
		const orders = new OrderRepository(database);
		orders.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		const tickets = new TicketService(
			new OrderService(orders),
			new TicketRepository(database),
			new CountingIds(),
			new FixedClock(),
		);

		expect(tickets.open("A-1042", "broken", "session-9").sessionId).toBe("session-9");
	});

	it("stores what it opened", () => {
		const database = new StoreDatabase();
		const orders = new OrderRepository(database);
		orders.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		const tickets = new TicketService(
			new OrderService(orders),
			new TicketRepository(database),
			new CountingIds(),
			new FixedClock(),
		);

		tickets.open("A-1042", "broken", "session-9");

		expect(tickets.of("A-1042")).toHaveLength(1);
	});

	it("refuses to open a ticket against an order that does not exist", () => {
		const database = new StoreDatabase();
		const orders = new OrderRepository(database);
		orders.save(Order.of("A-1042", "Ana", "Controller", 34_900, "gold", "2026-08-03T12:00:00.000Z", "delivered"));
		const tickets = new TicketService(
			new OrderService(orders),
			new TicketRepository(database),
			new CountingIds(),
			new FixedClock(),
		);

		expect(() => tickets.open("A-9", "broken")).toThrow(OrderNotFoundError);
	});
});
