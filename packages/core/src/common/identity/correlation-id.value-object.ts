import { IdentityText } from "./identity-text.value-object";

export class CorrelationId {
	private readonly text: IdentityText;

	private constructor(text: IdentityText) {
		this.text = text;
	}

	public static from(value: string): CorrelationId {
		return new CorrelationId(IdentityText.fromText(value, "CorrelationId"));
	}

	public get value(): string {
		return this.text.value;
	}

	public equals(other: CorrelationId): boolean {
		return this.text.equals(other.text);
	}

	public toString(): string {
		return this.text.value;
	}
}
