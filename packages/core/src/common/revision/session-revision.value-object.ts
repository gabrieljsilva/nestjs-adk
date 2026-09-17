import { InvalidRevisionError } from "../errors/invalid-revision.error";

/**
 * Position of a session in its own journal.
 * It starts at zero, only ever moves forward one step at a time, and is the value
 * optimistic concurrency compares on every append.
 */
export class SessionRevision {
	private readonly sequence: number;

	public constructor(sequence: number) {
		if (!Number.isSafeInteger(sequence) || sequence < 0) throw new InvalidRevisionError(sequence);
		this.sequence = sequence;
	}

	public static initial(): SessionRevision {
		return new SessionRevision(0);
	}

	public get value(): number {
		return this.sequence;
	}

	public next(): SessionRevision {
		return new SessionRevision(this.sequence + 1);
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
