import { Injectable } from "@nestjs/common";
import type { Order } from "./order";
import { RefundService } from "./refund.service";

@Injectable()
export class IssueRefundUseCase {
	public constructor(private readonly refunds: RefundService) {}

	public execute(orderId: string, amountCents: number): Order {
		return this.refunds.issue(orderId, amountCents);
	}
}
