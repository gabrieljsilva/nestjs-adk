/** Who a session belongs to, as the consuming application identifies its users. */
export class SessionOwner {
	private constructor(public readonly value: string) {}

	public static from(value: string): SessionOwner | undefined {
		const trimmed = value.trim();
		return trimmed.length === 0 ? undefined : new SessionOwner(trimmed);
	}

	public equals(other: SessionOwner): boolean {
		return this.value === other.value;
	}

	public toString(): string {
		return this.value;
	}
}
