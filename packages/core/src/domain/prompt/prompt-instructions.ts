/**
 * The central prompt of an agent, when it has one.
 * Absence is a first class answer: an agent can decide from the request and the
 * context alone, so nothing substitutes a default text here.
 */
export class PromptInstructions {
	private constructor(public readonly text: string) {}

	public static from(text: string): PromptInstructions {
		return new PromptInstructions(text.trim());
	}

	public get isEmpty(): boolean {
		return this.text.length === 0;
	}

	/** Joins two prompts into one block of text, skipping whichever side is empty. */
	public concat(other: PromptInstructions): PromptInstructions {
		if (this.isEmpty) return other;
		if (other.isEmpty) return this;
		return PromptInstructions.from(`${this.text}\n\n${other.text}`);
	}

	public toString(): string {
		return this.text;
	}
}
