import { IdentityText } from "./identity-text.value-object";

export class EventId {
	private readonly text: IdentityText;

	private constructor(text: IdentityText) {
		this.text = text;
	}

	public static from(value: string): EventId {
		return new EventId(IdentityText.fromText(value, "EventId"));
	}

	public get value(): string {
		return this.text.value;
	}

	public equals(other: EventId): boolean {
		return this.text.equals(other.text);
	}

	public toString(): string {
		return this.text.value;
	}
}
