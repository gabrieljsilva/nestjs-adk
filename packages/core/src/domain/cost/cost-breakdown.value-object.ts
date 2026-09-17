import { UsdAmount } from "./usd-amount.value-object";

/**
 * What a call cost, split by what it was charged for.
 *
 * `cached` is not a fourth kind of token: the provider reports cached tokens inside the input
 * count, so the cached share is taken out of input and charged at its own rate.
 */
export class CostBreakdown {
	public constructor(
		public readonly input: UsdAmount,
		public readonly output: UsdAmount,
		public readonly cached: UsdAmount = UsdAmount.zero(),
	) {}

	public static zero(): CostBreakdown {
		return new CostBreakdown(UsdAmount.zero(), UsdAmount.zero(), UsdAmount.zero());
	}

	public get total(): UsdAmount {
		return this.input.plus(this.output).plus(this.cached);
	}

	public plus(other: CostBreakdown): CostBreakdown {
		return new CostBreakdown(
			this.input.plus(other.input),
			this.output.plus(other.output),
			this.cached.plus(other.cached),
		);
	}
}
