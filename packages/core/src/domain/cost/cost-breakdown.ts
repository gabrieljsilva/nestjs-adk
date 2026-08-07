import { UsdAmount } from "./usd-amount";

/**
 * What a call cost, split by what it was charged for.
 *
 * The three parts are kept apart rather than summed on the way out. A ledger bills them as
 * separate columns, and recovering them from a total means dividing by a ratio to get back
 * what was already known. The split is computed anyway, so throwing it away only makes the
 * consumer do arithmetic we already did.
 *
 * `cached` is not a fourth kind of token. The provider reports cached tokens inside the input
 * count, so the cached share is taken out of input and charged at its own rate: adding the two
 * would bill the same tokens twice.
 */
export class CostBreakdown {
	private constructor(
		public readonly input: UsdAmount,
		public readonly output: UsdAmount,
		public readonly cached: UsdAmount,
	) {}

	/** `cached` defaults to nothing, which is what a call whose cache never engaged cost. */
	public static of(input: UsdAmount, output: UsdAmount, cached: UsdAmount = UsdAmount.zero()): CostBreakdown {
		return new CostBreakdown(input, output, cached);
	}

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
