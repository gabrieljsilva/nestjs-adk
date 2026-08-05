/**
 * Part of a tool call, as it arrives over a stream.
 *
 * Providers stream a call in pieces: the id and the name land first, then the
 * arguments arrive as fragments of JSON that only parse once the last one is in. The
 * delta carries the fragment verbatim, and the executor is what assembles the call.
 */
export class ToolCallDelta {
	public constructor(
		public readonly index: number,
		public readonly argumentsDelta: string,
		public readonly callId?: string,
		public readonly toolName?: string,
	) {}

	/** True when this delta opens a call rather than continuing one. */
	public get opensCall(): boolean {
		return this.callId !== undefined || this.toolName !== undefined;
	}
}
