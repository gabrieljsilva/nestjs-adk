import { InvalidInstantError } from "../errors/invalid-instant.error";

/** A point in time, always comparable and always serializable as ISO 8601. */
export class Instant {
	private readonly epochMillis: number;

	private constructor(epochMillis: number) {
		this.epochMillis = epochMillis;
	}

	public static fromEpochMillis(value: number): Instant {
		if (!Number.isSafeInteger(value)) throw new InvalidInstantError(value);
		return new Instant(value);
	}

	public static fromIso(value: string): Instant {
		const parsed = Date.parse(value);
		if (Number.isNaN(parsed)) throw new InvalidInstantError(value);
		return new Instant(parsed);
	}

	public get epoch(): number {
		return this.epochMillis;
	}

	public toIso(): string {
		return new Date(this.epochMillis).toISOString();
	}

	public plusMillis(amount: number): Instant {
		return Instant.fromEpochMillis(this.epochMillis + amount);
	}

	public equals(other: Instant): boolean {
		return this.epochMillis === other.epochMillis;
	}

	public isBefore(other: Instant): boolean {
		return this.epochMillis < other.epochMillis;
	}

	public isAfter(other: Instant): boolean {
		return this.epochMillis > other.epochMillis;
	}

	public toString(): string {
		return this.toIso();
	}
}
