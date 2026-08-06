import { Injectable } from "@nestjs/common";
import type { Ticket } from "./ticket";
import { TicketService } from "./ticket.service";

/**
 * A complaint about an order.
 *
 * The conversation it came out of is recorded when there is one: what the customer
 * attached lives in that session, so the ticket points at it instead of copying it.
 */
@Injectable()
export class OpenTicketUseCase {
	public constructor(private readonly tickets: TicketService) {}

	public execute(orderId: string, reason: string, sessionId?: string): Ticket {
		return this.tickets.open(orderId, reason, sessionId);
	}
}
