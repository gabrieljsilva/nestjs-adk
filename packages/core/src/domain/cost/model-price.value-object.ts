import { AppliedRates } from "./applied-rates.value-object";
import type { PriceBand } from "./price-band.value-object";
import type { TokenRate } from "./token-rate.value-object";

/**
 * What one model charges, with the bands that change it for a long prompt.
 *
 * Input and output are both required: a source that knows only one of them answers no price at
 * all, so the model is reported unpriced rather than billed for half of what it did. Without a
 * `cacheRead` rate, cached tokens are charged at the input rate.
 */
export class ModelPrice {
	public readonly cacheRead: TokenRate | undefined;
	public readonly bands: readonly PriceBand[];

	public constructor(
		public readonly input: TokenRate,
		public readonly output: TokenRate,
		options: { cacheRead?: TokenRate; bands?: readonly PriceBand[] } = {},
	) {
		this.cacheRead = options.cacheRead;
		this.bands = [...(options.bands ?? [])].sort((one, other) => one.aboveTokens - other.aboveTokens);
	}

	public resolveRates(promptTokens: number): AppliedRates {
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
