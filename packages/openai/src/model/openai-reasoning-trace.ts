/**
 * What a thinking model said to itself before it asked for a tool, gathered over one stream.
 *
 * DeepSeek streams it as `reasoning_content` deltas ahead of the `tool_calls`, and refuses
 * the next request of the same turn unless the assistant message carrying the calls brings
 * it back. It is opaque to the runtime, so it rides the call as its signature, the slot a
 * provider's own bookkeeping already has (see `ToolCallDelta`).
 *
 * One trace per stream, because the mapper is shared across streams and the thought belongs
 * to the answer it preceded. `claim` empties it: the first call to open gets the whole
 * thought, and a parallel call after it carries nothing, which is how the request mapper
 * knows which message the thought belongs to.
 */
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
