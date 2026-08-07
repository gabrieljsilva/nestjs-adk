import { NegativeAmountError } from "./errors/negative-amount.error";
import type { TokenRate } from "./token-rate";

/**
 * A rate that only applies once a prompt passes a size.
 *
 * Providers charge a long context more per token, and the catalog publishes it as a separate
 * field per threshold (`input_cost_per_token_above_200k_tokens`). 107 of its entries have
 * one, so this is a real shape and not a hypothetical.
 *
 * A band overrides only the rates it declares. A band that raises the input rate and says
 * nothing about output leaves output where the base price had it, because that is what the
 * provider published.
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

	/** Whether a prompt of this size is charged at this band. The threshold itself is not past it. */
	public appliesTo(promptTokens: number): boolean {
		return promptTokens > this.aboveTokens;
	}
}
