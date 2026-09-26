import { Injectable } from "@nestjs/common";
import { OrderNotFoundError } from "./errors/order-not-found.error";
import type { Order } from "./order";
import { OrderRepository } from "./order.repository";

@Injectable()
export class OrderService {
	public constructor(private readonly orders: OrderRepository) {}

	public find(orderId: string): Order {
		const order = this.orders.findById(orderId.trim());
		if (order === undefined) throw new OrderNotFoundError(orderId);
		return order;
	}
}
