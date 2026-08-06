import { Injectable } from "@nestjs/common";
import { StoreDatabase } from "../shared/store-database";
import { StoreRow } from "../shared/store-row";
import { Order } from "./order";

const COLUMNS = "id, customer, product, total_cents, plan, delivered_on, status, refunded_cents";

/** Rows in, `Order` out. Nothing here decides whether a refund may happen. */
@Injectable()
export class OrderRepository {
	public constructor(private readonly database: StoreDatabase) {}

	/** Ignores an order the store already has, so seeding twice is not an error. */
	public save(order: Order): void {
		this.database.connection.run(
			`INSERT OR IGNORE INTO orders (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			order.id,
			order.customer,
			order.product,
			order.totalCents,
			order.plan,
			order.deliveredOn,
			order.status,
			order.refundedCents,
		);
	}

	public findById(id: string): Order | undefined {
		const row = this.database.connection.first(`SELECT ${COLUMNS} FROM orders WHERE id = ?`, id);
		return row === undefined ? undefined : this.orderOf(row);
	}

	/** The write a refund is: the money is recorded against the order that was refunded. */
	public markRefunded(order: Order, cents: number): Order {
		const refunded = order.refunded(cents);
		this.database.connection.run(
			"UPDATE orders SET status = ?, refunded_cents = ? WHERE id = ?",
			refunded.status,
			refunded.refundedCents,
			refunded.id,
		);
		return refunded;
	}

	private orderOf(source: unknown): Order {
		const row = new StoreRow(source);
		return Order.of(
			row.text("id"),
			row.text("customer"),
			row.text("product"),
			row.integer("total_cents"),
			row.text("plan"),
			row.text("delivered_on"),
			row.text("status"),
			row.integer("refunded_cents"),
		);
	}
}
