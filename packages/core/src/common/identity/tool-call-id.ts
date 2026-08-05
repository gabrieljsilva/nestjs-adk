import { IdentityText } from "./identity-text";

/** Identity that pairs a tool call with the result it produced. */
export class ToolCallId {
	private readonly text: IdentityText;

	private constructor(text: IdentityText) {
		this.text = text;
	}

	public static from(value: string): ToolCallId {
		return new ToolCallId(IdentityText.of(value, "ToolCallId"));
	}

	public get value(): string {
		return this.text.value;
	}

	public equals(other: ToolCallId): boolean {
		return this.text.equals(other.text);
	}

	public toString(): string {
		return this.text.value;
	}
}
