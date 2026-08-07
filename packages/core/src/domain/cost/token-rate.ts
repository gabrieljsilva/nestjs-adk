import { NegativeAmountError } from "./errors/negative-amount.error";
import { UsdAmount } from "./usd-amount";

/** Pico dollars in one dollar, which is the scale a rate is stored at. */
const PICO_PER_USD = 1e12;

/**
 * What one token costs, as an exact integer of pico dollars.
 *
 * {@link fromUsdPerToken} is the only place in the cost path where a value is rounded, and
 * it is rounded once. A catalog publishes rates as JSON floats, so the number arriving here
 * is already whatever float64 could represent; converting it to an integer at this scale is
 * lossless for every rate the LiteLLM catalog publishes, including the smallest, `1.3e-10`.
 * Rounding to nearest rather than truncating is what makes it lossless: `0.017 * 1e12` comes
 * out as `17000000000.000002`, and the nearest integer is the value the catalog meant.
 *
 * Everything after this multiplies and adds integers, so the total carries no drift of its
 * own.
 */
export class TokenRate {
	private constructor(public readonly picoPerToken: bigint) {}

	public static zero(): TokenRate {
		return new TokenRate(0n);
	}

	public static ofPico(picoPerToken: bigint): TokenRate {
		if (picoPerToken < 0n) throw new NegativeAmountError(picoPerToken.toString());
		return new TokenRate(picoPerToken);
	}

	/** A rate as a catalog publishes it: dollars per token, as a float. Rounded to the nearest pico, once. */
	public static fromUsdPerToken(usdPerToken: number): TokenRate {
		if (!Number.isFinite(usdPerToken) || usdPerToken < 0) throw new NegativeAmountError(String(usdPerToken));
		return new TokenRate(BigInt(Math.round(usdPerToken * PICO_PER_USD)));
	}

	public costOf(tokens: number): UsdAmount {
		return UsdAmount.ofPico(this.picoPerToken).times(tokens);
	}

	public get isZero(): boolean {
		return this.picoPerToken === 0n;
	}

	public equals(other: TokenRate): boolean {
		return this.picoPerToken === other.picoPerToken;
	}

	/** The rate back in the unit a catalog publishes, for a report that shows what was applied. */
	public toUsdPerToken(): number {
		return Number(this.picoPerToken) / PICO_PER_USD;
	}
}
