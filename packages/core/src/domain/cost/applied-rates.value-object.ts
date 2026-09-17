import type { TokenRate } from "./token-rate.value-object";

export class AppliedRates {
	public constructor(
		public readonly input: TokenRate,
		public readonly output: TokenRate,
		public readonly cacheRead?: TokenRate,
	) {}

	public get cached(): TokenRate {
		return this.cacheRead ?? this.input;
	}
}
