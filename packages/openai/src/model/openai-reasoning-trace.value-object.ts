export class OpenAiReasoningTrace {
	private parts: string[] = [];

	public record(delta: string): void {
		if (delta.length > 0) this.parts.push(delta);
	}

	public claim(): string | undefined {
		if (this.parts.length === 0) return undefined;
		const text = this.parts.join("");
		this.parts = [];
		return text;
	}
}
