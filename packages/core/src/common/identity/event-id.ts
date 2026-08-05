import { IdentityText } from "./identity-text";

/** Identity of a persisted event, and the key of its idempotency. */
export class EventId {
	private readonly text: IdentityText;

	private constructor(text: IdentityText) {
		this.text = text;
	}

	public static from(value: string): EventId {
		return new EventId(IdentityText.of(value, "EventId"));
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
