const CENTS_PER_REAL = 100;

/**
 * Whether a refund may be issued, and what to tell the customer when it may not.
 *
 * The reason is part of the answer rather than a log line: it is what the agent reads
 * back to whoever asked, so a refusal that cannot explain itself is a refusal nobody
 * can act on.
 */
export class RefundDecision {
	private constructor(
		public readonly allowed: boolean,
		public readonly reason: string,
		public readonly limitCents: number,
	) {}

	public static allowed(limitCents: number): RefundDecision {
		return new RefundDecision(true, "within the plan limit and the refund window", limitCents);
	}

	public static refused(reason: string, limitCents: number): RefundDecision {
		return new RefundDecision(false, reason, limitCents);
	}

	public get limitBrl(): number {
		return this.limitCents / CENTS_PER_REAL;
	}
}
