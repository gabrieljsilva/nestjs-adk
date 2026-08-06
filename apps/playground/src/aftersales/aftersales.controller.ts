import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { FindOrderUseCase } from "./find-order.use-case";
import { IssueRefundUseCase } from "./issue-refund.use-case";
import { OpenTicketUseCase } from "./open-ticket.use-case";
import type { Order } from "./order";
import { RefundLimitUseCase } from "./refund-limit.use-case";
import type { Ticket } from "./ticket";

/**
 * After sales over HTTP, for the customer who is not talking to the agent.
 *
 * Every route here has a tool behind the same use case, which is the point: the store
 * has one way to open a ticket and one way to refund an order, and a conversation is a
 * second entrance to it rather than a second implementation of it.
 */
@Controller("aftersales")
export class AftersalesController {
	public constructor(
		private readonly findOrderUseCase: FindOrderUseCase,
		private readonly openTicketUseCase: OpenTicketUseCase,
		private readonly refundLimitUseCase: RefundLimitUseCase,
		private readonly issueRefundUseCase: IssueRefundUseCase,
	) {}

	@Get("orders/:id")
	public order(@Param("id") id: string): Order {
		return this.findOrderUseCase.execute(id);
	}

	@Get("refund-limit")
	public limit(@Query("plan") plan: string): number {
		return this.refundLimitUseCase.execute(plan);
	}

	/** Opened on the site, so there is no conversation behind it. */
	@Post("tickets")
	public open(@Body("orderId") orderId: string, @Body("reason") reason: string): Ticket {
		return this.openTicketUseCase.execute(orderId, reason);
	}

	@Post("orders/:id/refund")
	public refund(@Param("id") id: string, @Body("amountCents", ParseIntPipe) amountCents: number): Order {
		return this.issueRefundUseCase.execute(id, amountCents);
	}
}
