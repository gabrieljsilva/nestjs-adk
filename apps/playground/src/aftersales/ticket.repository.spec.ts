import { beforeEach, describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { Ticket } from "./ticket";
import { TicketRepository } from "./ticket.repository";

let tickets: TicketRepository;

beforeEach(() => {
	tickets = new TicketRepository(new StoreDatabase());
});

describe("TicketRepository", () => {
	it("reads back the ticket it wrote, conversation included", () => {
		const ticket = Ticket.of("T-1", "A-1042", "quebrado", "2026-08-05T00:00:00.000Z", "session-9");

		tickets.save(ticket);

		expect(tickets.findByOrder("A-1042")).toEqual([ticket]);
	});

	it("writes a ticket that was opened outside a conversation", () => {
		tickets.save(Ticket.of("T-2", "A-1042", "pelo site", "2026-08-05T00:00:00.000Z"));

		expect(tickets.findByOrder("A-1042").at(0)?.fromConversation).toBe(false);
	});

	it("answers nothing for an order with no complaint", () => {
		expect(tickets.findByOrder("B-2071")).toEqual([]);
	});

	it("lists the tickets of one order in the order they were opened", () => {
		tickets.save(Ticket.of("T-2", "A-1042", "segundo", "2026-08-06T00:00:00.000Z"));
		tickets.save(Ticket.of("T-1", "A-1042", "primeiro", "2026-08-05T00:00:00.000Z"));

		expect(tickets.findByOrder("A-1042").map((ticket) => ticket.id)).toEqual(["T-1", "T-2"]);
	});
});
