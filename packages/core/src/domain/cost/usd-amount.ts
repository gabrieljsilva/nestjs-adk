import { NegativeAmountError } from "./errors/negative-amount.error";

/** How many pico dollars are one dollar. Every amount is an integer count of these. */
const PICO_PER_USD = 1_000_000_000_000n;

/** Twelve, which is how many digits a pico amount has after the point. */
const SCALE = 12;

/**
 * An amount of US dollars, held as an exact integer of pico dollars.
 *
 * Money is integers here for a measured reason. The cheapest rate the LiteLLM catalog
 * publishes is `1.3e-10` per token, so a unit of nano dollars truncates 103 of the 5345
 * published rates to something they are not, and one of them to zero. Pico loses none of
 * them. Going finer is worse rather than better: multiplying a published rate by `1e15`
 * leaves float64 exactness behind, so femto reintroduces the error it was meant to avoid.
 *
 * The count is a `bigint` and not a `number` because `Number.MAX_SAFE_INTEGER` in pico
 * dollars is about 9007 dollars. A single run never reaches that, and an accumulator that
 * lives for a month does.
 *
 * Read it with {@link toString}, which is exact and is what a decimal column wants.
 * {@link toNumber} is for a log line and says so.
 */
export class UsdAmount {
	private constructor(public readonly pico: bigint) {}

	public static zero(): UsdAmount {
		return new UsdAmount(0n);
	}

	/** An exact count of pico dollars. Negative is refused: nothing here bills backwards. */
	public static ofPico(pico: bigint): UsdAmount {
		if (pico < 0n) throw new NegativeAmountError(pico.toString());
		return new UsdAmount(pico);
	}

	public plus(other: UsdAmount): UsdAmount {
		return new UsdAmount(this.pico + other.pico);
	}

	public times(count: number): UsdAmount {
		if (!Number.isInteger(count) || count < 0) throw new NegativeAmountError(String(count));
		return new UsdAmount(this.pico * BigInt(count));
	}

	public get isZero(): boolean {
		return this.pico === 0n;
	}

	public equals(other: UsdAmount): boolean {
		return this.pico === other.pico;
	}

	/**
	 * The exact amount as a decimal string, with no exponent and no trailing zeroes.
	 *
	 * A tiny amount is where a float would reach for scientific notation, and a ledger
	 * column cannot store `8.8e-6`. This is the reading meant to be persisted.
	 */
	public toString(): string {
		const whole = this.pico / PICO_PER_USD;
		const fraction = (this.pico % PICO_PER_USD).toString().padStart(SCALE, "0").replace(/0+$/, "");
		return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
	}

	/** The amount as a float, for a log line or a chart. Lossy by nature: do not bill from it. */
	public toNumber(): number {
		return Number(this.pico) / Number(PICO_PER_USD);
	}

	/**
	 * The exact decimal string, so an amount survives `JSON.stringify`.
	 *
	 * Without this a controller that answers with an `AgentResult` throws, because a `bigint`
	 * cannot be serialized. Answering the string rather than the pico count is also the reading
	 * a client wants: exact, and in dollars.
	 */
	public toJSON(): string {
		return this.toString();
	}
}
