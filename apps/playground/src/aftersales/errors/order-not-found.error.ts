import { AdkError } from "@nestjs-adk/core";

export class OrderNotFoundError extends AdkError {
	public readonly code = "PLAYGROUND_ORDER_NOT_FOUND";

	public constructor(public readonly orderId: string) {
		super(`There is no order ${orderId}.`);
	}
}
