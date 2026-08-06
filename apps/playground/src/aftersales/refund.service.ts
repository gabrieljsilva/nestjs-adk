import { Clock } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { RefundRefusedError } from "./errors/refund-refused.error";
import type { Order } from "./order";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";
import type { RefundDecision } from "./refund-decision";
import { RefundPolicy } from "./refund-policy";

/**
 * Money leaving the store.
 *
 * The policy answers whether it may; this is what happens when it may, and what is raised
 * when it may not. The decision is asked for at the instant the refund is issued rather
 * than when the conversation started, because a run that waited for a human to approve it
 * may have waited past the window.
 */
@Injectable()
export class RefundService {
	public constructor(
		private readonly orders: OrderService,
		private readonly repository: OrderRepository,
		private readonly policy: RefundPolicy,
		private readonly clock: Clock,
	) {}

	public limitCentsFor(plan: string): number {
		return this.policy.limitCentsFor(plan);
	}

	/** What would happen, without anything happening: what the agent quotes before asking. */
	public decide(orderId: string, amountCents: number): RefundDecision {
		return this.policy.decide(this.orders.find(orderId), amountCents, this.clock.now());
	}

	public issue(orderId: string, amountCents: number): Order {
		const order = this.orders.find(orderId);
		const decision = this.policy.decide(order, amountCents, this.clock.now());
		if (!decision.allowed) throw new RefundRefusedError(order.id, decision.reason);
		return this.repository.markRefunded(order, amountCents);
	}
}
