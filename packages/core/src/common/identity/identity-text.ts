import { InvalidIdentityError } from "../errors/invalid-identity.error";

/**
 * Non-empty text backing every typed identity.
 * Each identity class holds its own private field of this type, which is what keeps
 * `SessionId` and `AgentRunId` mutually incompatible at compile time.
 */
export class IdentityText {
	private constructor(public readonly value: string) {}

	public static of(value: string, owner: string): IdentityText {
		const trimmed = value.trim();
		if (trimmed.length === 0) throw new InvalidIdentityError(owner, value);
		return new IdentityText(trimmed);
	}

	public equals(other: IdentityText): boolean {
		return this.value === other.value;
	}
}
