import { NegativeAmountError } from "./errors/negative-amount.error";

const PICO_PER_USD = 1_000_000_000_000n;

const SCALE = 12;

/**
 * An amount of US dollars, held as an exact integer of pico dollars in a `bigint`.
 *
 * Read it with {@link toString}, which is exact and is what a decimal column wants.
 * {@link toNumber} is lossy and is for a log line or a chart, never for a bill.
 */
export class UsdAmount {
	private constructor(public readonly pico: bigint) {}

	public static zero(): UsdAmount {
		return new UsdAmount(0n);
	}

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

	public toString(): string {
		const whole = this.pico / PICO_PER_USD;
		const fraction = (this.pico % PICO_PER_USD).toString().padStart(SCALE, "0").replace(/0+$/, "");
		return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
	}

	public toNumber(): number {
		return Number(this.pico) / Number(PICO_PER_USD);
	}

	public toJSON(): string {
		return this.toString();
	}
}
