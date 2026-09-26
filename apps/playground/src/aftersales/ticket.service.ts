import { Clock, IdGenerator } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { OrderService } from "./order.service";
import { Ticket } from "./ticket";
import { TicketRepository } from "./ticket.repository";

const PREFIX = "T-";

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
