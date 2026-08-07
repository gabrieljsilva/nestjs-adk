import type { TokenRate } from "./token-rate";

/**
 * The rates a single call was actually charged at, after the band for its prompt was picked.
 *
 * It travels out with the cost because a consumer that bills these numbers needs to multiply
 * them itself. Handing back only a total would force it to divide a float by a token count to
 * recover a rate we already knew, and a call in one band cannot be re-derived from an
 * aggregate that mixes bands.
 *
 * `cacheRead` is absent when the provider publishes no cache rate. Those tokens are then
 * charged at the input rate, which is what the provider bills anyway.
 */
export class AppliedRates {
	public constructor(
		public readonly input: TokenRate,
		public readonly output: TokenRate,
		public readonly cacheRead?: TokenRate,
	) {}

	/** What a cached token costs: the cache rate when there is one, and the input rate when there is not. */
	public get cached(): TokenRate {
		return this.cacheRead ?? this.input;
	}
}
