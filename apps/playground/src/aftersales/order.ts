import type { Instant } from "@nestjs-adk/core";

const CENTS_PER_REAL = 100;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * One purchase, as after sales needs to see it.
 *
 * Money is held in cents because a refund compared in floating point is a refund that
 * is off by a centavo on the day somebody notices. Reais exist for reading, and for the
 * one place a customer sees a number.
 */
export class Order {
	private constructor(
		public readonly id: string,
		public readonly customer: string,
		public readonly product: string,
		public readonly totalCents: number,
		public readonly plan: string,
		public readonly deliveredOn: string,
		public readonly status: string,
		public readonly refundedCents: number,
	) {}

	public static of(
		id: string,
		customer: string,
		product: string,
		totalCents: number,
		plan: string,
		deliveredOn: string,
		status: string,
		refundedCents = 0,
	): Order {
		return new Order(id, customer, product, totalCents, plan, deliveredOn, status, refundedCents);
	}

	public get totalBrl(): number {
		return this.totalCents / CENTS_PER_REAL;
	}

	public get isRefunded(): boolean {
		return this.refundedCents > 0;
	}

	/** Whole days, rounded down: a refund window is counted in days, not in hours. */
	public daysSinceDelivery(now: Instant): number {
		return Math.floor((now.epoch - Date.parse(this.deliveredOn)) / MILLIS_PER_DAY);
	}

	public refunded(cents: number): Order {
		return new Order(
			this.id,
			this.customer,
			this.product,
			this.totalCents,
			this.plan,
			this.deliveredOn,
			"refunded",
			cents,
		);
	}
}
