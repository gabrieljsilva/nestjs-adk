import { NegativeAmountError } from "./errors/negative-amount.error";
import type { TokenRate } from "./token-rate.value-object";

/**
 * A rate that only applies once a prompt passes a size.
 *
 * A band overrides only the rates it declares: one that raises input and says nothing about
 * output leaves output where the base price had it.
 */
export class PriceBand {
	private constructor(
		public readonly aboveTokens: number,
		public readonly input?: TokenRate,
		public readonly output?: TokenRate,
		public readonly cacheRead?: TokenRate,
	) {}

	public static above(
		tokens: number,
		rates: { input?: TokenRate; output?: TokenRate; cacheRead?: TokenRate },
	): PriceBand {
		if (!Number.isInteger(tokens) || tokens < 0) throw new NegativeAmountError(String(tokens));
		return new PriceBand(tokens, rates.input, rates.output, rates.cacheRead);
	}

	public appliesTo(promptTokens: number): boolean {
		return promptTokens > this.aboveTokens;
	}
}
