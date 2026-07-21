import { Injectable } from "@nestjs/common";

export interface Order {
	id: string;
	status: string;
	total: number;
}

@Injectable()
export class OrdersService {
	private readonly orders = new Map<string, Order>([
		["123", { id: "123", status: "shipped", total: 250 }],
		["456", { id: "456", status: "processing", total: 1800 }],
	]);

	public find(id: string): Order | undefined {
		return this.orders.get(id);
	}

	public refund(id: string): { refunded: boolean; orderId: string } {
		return { refunded: true, orderId: id };
	}
}
