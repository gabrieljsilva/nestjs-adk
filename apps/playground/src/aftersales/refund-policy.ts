import type { Instant } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import type { Order } from "./order";
import { RefundDecision } from "./refund-decision";

/** Published in the store's terms, which is why it is a number and not a judgement call. */
const WINDOW_DAYS = 7;

/** What each plan may have back without a manager looking at it, in cents. */
const LIMITS: ReadonlyMap<string, number> = new Map([
	["gold", 143_700],
	["silver", 47_500],
	["bronze", 9_900],
]);

const DEFAULT_LIMIT_CENTS = 9_900;

@Injectable()
export class RefundPolicy {
	public limitCentsFor(plan: string): number {
		return LIMITS.get(plan.toLowerCase()) ?? DEFAULT_LIMIT_CENTS;
	}

	public decide(order: Order, amountCents: number, now: Instant): RefundDecision {
		const limit = this.limitCentsFor(order.plan);
		if (order.isRefunded) return RefundDecision.refused(`order ${order.id} was already refunded`, limit);
		if (amountCents <= 0) return RefundDecision.refused("a refund has to be worth something", limit);
		if (amountCents > order.totalCents) {
			return RefundDecision.refused(`order ${order.id} was worth less than that`, limit);
		}
		if (order.daysSinceDelivery(now) > WINDOW_DAYS) {
			return RefundDecision.refused(`the refund window of ${WINDOW_DAYS} days has passed`, limit);
		}
		if (amountCents > limit) {
			return RefundDecision.refused(`plan ${order.plan} refunds up to ${limit / 100} reais without approval`, limit);
		}
		return RefundDecision.allowed(limit);
	}
}
