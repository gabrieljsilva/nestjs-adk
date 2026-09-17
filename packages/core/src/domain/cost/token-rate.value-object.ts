import { NegativeAmountError } from "./errors/negative-amount.error";
import { UsdAmount } from "./usd-amount.value-object";

const PICO_PER_USD = 1e12;

/**
 * What one token costs, as an exact integer of pico dollars.
 *
 * {@link fromUsdPerToken} is the only rounding step in the cost path; everything after it is
 * integer arithmetic, so a total carries no drift of its own.
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

	public static fromUsdPerToken(usdPerToken: number): TokenRate {
		if (!Number.isFinite(usdPerToken) || usdPerToken < 0) throw new NegativeAmountError(String(usdPerToken));
		// Rounding to nearest: `0.017 * 1e12` is `17000000000.000002` in float.
		return new TokenRate(BigInt(Math.round(usdPerToken * PICO_PER_USD)));
	}

	public calculateCost(tokens: number): UsdAmount {
		return UsdAmount.ofPico(this.picoPerToken).times(tokens);
	}

	public get isZero(): boolean {
		return this.picoPerToken === 0n;
	}

	public equals(other: TokenRate): boolean {
		return this.picoPerToken === other.picoPerToken;
	}

	public toUsdPerToken(): number {
		return Number(this.picoPerToken) / PICO_PER_USD;
	}
}
