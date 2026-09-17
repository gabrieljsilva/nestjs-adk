/**
 * The central prompt of an agent, trimmed. Absence is a first class answer: nothing substitutes
 * a default text here.
 */
export class PromptInstructions {
	private constructor(public readonly text: string) {}

	public static from(text: string): PromptInstructions {
		return new PromptInstructions(text.trim());
	}

	public get isEmpty(): boolean {
		return this.text.length === 0;
	}

	public concat(other: PromptInstructions): PromptInstructions {
		if (this.isEmpty) return other;
		if (other.isEmpty) return this;
		return PromptInstructions.from(`${this.text}\n\n${other.text}`);
	}

	public toString(): string {
		return this.text;
	}
}
