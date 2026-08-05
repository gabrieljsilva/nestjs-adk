import { IdentityText } from "./identity-text";

/** Identity of a single command execution inside a session. */
export class AgentRunId {
	private readonly text: IdentityText;

	private constructor(text: IdentityText) {
		this.text = text;
	}

	public static from(value: string): AgentRunId {
		return new AgentRunId(IdentityText.of(value, "AgentRunId"));
	}

	public get value(): string {
		return this.text.value;
	}

	public equals(other: AgentRunId): boolean {
		return this.text.equals(other.text);
	}

	public toString(): string {
		return this.text.value;
	}
}
