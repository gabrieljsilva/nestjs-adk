import { Injectable } from "@nestjs/common";
import type { Order } from "./order";
import { OrderService } from "./order.service";

@Injectable()
export class FindOrderUseCase {
	public constructor(private readonly orders: OrderService) {}

	public execute(orderId: string): Order {
		return this.orders.find(orderId);
	}
}
