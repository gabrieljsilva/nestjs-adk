const CENTS_PER_REAL = 100;

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
