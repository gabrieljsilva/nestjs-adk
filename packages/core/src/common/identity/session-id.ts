import { IdentityText } from "./identity-text";

/** Identity of a conversation that survives across runs. */
export class SessionId {
	private readonly text: IdentityText;

	private constructor(text: IdentityText) {
		this.text = text;
	}

	public static from(value: string): SessionId {
		return new SessionId(IdentityText.of(value, "SessionId"));
	}

	public get value(): string {
		return this.text.value;
	}

	public equals(other: SessionId): boolean {
		return this.text.equals(other.text);
	}

	public toString(): string {
		return this.text.value;
	}
}
