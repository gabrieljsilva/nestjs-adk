import { Injectable } from "@nestjs/common";
import type { Ticket } from "./ticket";
import { TicketService } from "./ticket.service";

@Injectable()
export class OpenTicketUseCase {
	public constructor(private readonly tickets: TicketService) {}

	public execute(orderId: string, reason: string, sessionId?: string): Ticket {
		return this.tickets.open(orderId, reason, sessionId);
	}
}
