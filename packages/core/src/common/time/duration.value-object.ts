import { InvalidDurationError } from "../errors/invalid-duration.error";

/** A length of time, always a whole non negative count of milliseconds. */
export class Duration {
	private constructor(public readonly millis: number) {}

	public static fromMillis(value: number): Duration {
		if (!Number.isSafeInteger(value) || value < 0) throw new InvalidDurationError(value);
		return new Duration(value);
	}

	public static fromSeconds(value: number): Duration {
		if (!Number.isFinite(value) || value < 0) throw new InvalidDurationError(value);
		return Duration.fromMillis(Math.ceil(value * 1000));
	}

	public static zero(): Duration {
		return new Duration(0);
	}

	public get isZero(): boolean {
		return this.millis === 0;
	}

	public cappedAt(ceiling: Duration): Duration {
		return this.millis <= ceiling.millis ? this : ceiling;
	}

	public isLongerThan(other: Duration): boolean {
		return this.millis > other.millis;
	}

	public toString(): string {
		return `${this.millis}ms`;
	}
}
