import { Clock, IdGenerator } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { OrderService } from "./order.service";
import { Ticket } from "./ticket";
import { TicketRepository } from "./ticket.repository";

const PREFIX = "T-";

/**
 * Opening a complaint about an order.
 *
 * The order is read first, so a ticket can never point at a number the store never sold,
 * and the customer hears about the wrong number instead of being told everything is fine.
 */
@Injectable()
export class TicketService {
	public constructor(
		private readonly orders: OrderService,
		private readonly tickets: TicketRepository,
		private readonly ids: IdGenerator,
		private readonly clock: Clock,
	) {}

	public open(orderId: string, reason: string, sessionId?: string): Ticket {
		const order = this.orders.find(orderId);
		const ticket = Ticket.of(`${PREFIX}${this.ids.next()}`, order.id, reason, this.clock.now().toIso(), sessionId);
		this.tickets.save(ticket);
		return ticket;
	}

	public of(orderId: string): readonly Ticket[] {
		return this.tickets.findByOrder(orderId);
	}
}
