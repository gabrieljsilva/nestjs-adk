import { InvalidRevisionError } from "../errors/invalid-revision.error";

/**
 * Position of a session in its own journal.
 * It starts at zero, only ever moves forward one step at a time, and is the value
 * optimistic concurrency compares on every append.
 */
export class SessionRevision {
	private readonly sequence: number;

	private constructor(sequence: number) {
		this.sequence = sequence;
	}

	public static initial(): SessionRevision {
		return new SessionRevision(0);
	}

	public static of(value: number): SessionRevision {
		if (!Number.isSafeInteger(value) || value < 0) throw new InvalidRevisionError(value);
		return new SessionRevision(value);
	}

	public get value(): number {
		return this.sequence;
	}

	public next(): SessionRevision {
		return SessionRevision.of(this.sequence + 1);
	}

	public equals(other: SessionRevision): boolean {
		return this.sequence === other.sequence;
	}

	public isAfter(other: SessionRevision): boolean {
		return this.sequence > other.sequence;
	}

	/** True when `other` is exactly the next revision, which is what a gapless journal requires. */
	public precedes(other: SessionRevision): boolean {
		return other.sequence === this.sequence + 1;
	}

	public toString(): string {
		return String(this.sequence);
	}
}
