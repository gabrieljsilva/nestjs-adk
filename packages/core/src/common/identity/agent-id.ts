import { IdentityText } from "./identity-text";

/** Identity of an agent inside the catalog. */
export class AgentId {
	private readonly text: IdentityText;

	private constructor(text: IdentityText) {
		this.text = text;
	}

	public static from(value: string): AgentId {
		return new AgentId(IdentityText.of(value, "AgentId"));
	}

	public get value(): string {
		return this.text.value;
	}

	public equals(other: AgentId): boolean {
		return this.text.equals(other.text);
	}

	public toString(): string {
		return this.text.value;
	}
}
