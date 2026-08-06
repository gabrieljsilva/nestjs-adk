import { Injectable } from "@nestjs/common";
import { OrderNotFoundError } from "./errors/order-not-found.error";
import type { Order } from "./order";
import { OrderRepository } from "./order.repository";

/**
 * The one way into an order.
 *
 * Everything after sales does starts by having the order in hand, and having one place
 * that refuses a number nobody sold is what keeps every caller after it from checking
 * for `undefined` and inventing its own message.
 */
@Injectable()
export class OrderService {
	public constructor(private readonly orders: OrderRepository) {}

	public find(orderId: string): Order {
		const order = this.orders.findById(orderId.trim());
		if (order === undefined) throw new OrderNotFoundError(orderId);
		return order;
	}
}
