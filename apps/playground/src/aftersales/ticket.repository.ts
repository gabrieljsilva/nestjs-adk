import { Injectable } from "@nestjs/common";
import { StoreDatabase } from "../shared/store-database";
import { StoreRow } from "../shared/store-row";
import { Ticket } from "./ticket";

const COLUMNS = "id, order_id, reason, session_id, opened_at";

/** Rows in, `Ticket` out. */
@Injectable()
export class TicketRepository {
	public constructor(private readonly database: StoreDatabase) {}

	public save(ticket: Ticket): void {
		this.database.connection.run(
			`INSERT INTO tickets (${COLUMNS}) VALUES (?, ?, ?, ?, ?)`,
			ticket.id,
			ticket.orderId,
			ticket.reason,
			ticket.sessionId ?? null,
			ticket.openedAt,
		);
	}

	public findByOrder(orderId: string): readonly Ticket[] {
		return this.database.connection
			.all(`SELECT ${COLUMNS} FROM tickets WHERE order_id = ? ORDER BY opened_at`, orderId)
			.map((row) => this.ticketOf(row));
	}

	private ticketOf(source: unknown): Ticket {
		const row = new StoreRow(source);
		return Ticket.of(
			row.text("id"),
			row.text("order_id"),
			row.text("reason"),
			row.text("opened_at"),
			row.optionalText("session_id"),
		);
	}
}
