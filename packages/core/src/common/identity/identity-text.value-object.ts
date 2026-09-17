import { InvalidIdentityError } from "../errors/invalid-identity.error";

export class IdentityText {
	private constructor(public readonly value: string) {}

	public static fromText(value: string, owner: string): IdentityText {
		const trimmed = value.trim();
		if (trimmed.length === 0) throw new InvalidIdentityError(owner, value);
		return new IdentityText(trimmed);
	}

	public equals(other: IdentityText): boolean {
		return this.value === other.value;
	}
}
