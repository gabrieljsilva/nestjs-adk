import { AppliedRates } from "./applied-rates";
import type { PriceBand } from "./price-band";
import type { TokenRate } from "./token-rate";

/**
 * What one model charges, with the bands that change it for a long prompt.
 *
 * Input and output are both required, and that is a rule rather than a convenience: a partial
 * price is not a cheaper price. A catalog entry that publishes an input rate and no output
 * rate says nothing usable about what a call costs, so no price is built and the model is
 * reported as unpriced instead of being billed for half of what it did.
 *
 * `cacheRead` is optional because most providers publish no cache rate. Without one, cached
 * tokens are charged at the input rate.
 */
export class ModelPrice {
	private constructor(
		public readonly input: TokenRate,
		public readonly output: TokenRate,
		public readonly cacheRead: TokenRate | undefined,
		public readonly bands: readonly PriceBand[],
	) {}

	/** Bands are sorted here so that the caller does not have to, and the highest one wins. */
	public static of(
		input: TokenRate,
		output: TokenRate,
		options: { cacheRead?: TokenRate; bands?: readonly PriceBand[] } = {},
	): ModelPrice {
		const bands = [...(options.bands ?? [])].sort((one, other) => one.aboveTokens - other.aboveTokens);
		return new ModelPrice(input, output, options.cacheRead, bands);
	}

	/**
	 * The rates for a prompt of this size.
	 *
	 * The highest band the prompt passed is the one that applies, and each rate it declares
	 * replaces the base. A band is not additive: a prompt over 200k is charged the 200k rate,
	 * not the base plus something.
	 */
	public ratesFor(promptTokens: number): AppliedRates {
		let input = this.input;
		let output = this.output;
		let cacheRead = this.cacheRead;
		for (const band of this.bands) {
			if (!band.appliesTo(promptTokens)) continue;
			input = band.input ?? input;
			output = band.output ?? output;
			cacheRead = band.cacheRead ?? cacheRead;
		}
		return new AppliedRates(input, output, cacheRead);
	}
}
