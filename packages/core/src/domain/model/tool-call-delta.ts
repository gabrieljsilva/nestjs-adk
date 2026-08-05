/**
 * Part of a tool call, as it arrives over a stream.
 *
 * Providers stream a call in pieces: the id and the name land first, then the
 * arguments arrive as fragments of JSON that only parse once the last one is in. The
 * delta carries the fragment verbatim, and the executor is what assembles the call.
 *
 * The signature is an opaque token some providers attach to a call and refuse the next
 * turn without. It means nothing here on purpose: reading it would be guessing about
 * something the provider deliberately did not explain.
 */
export class ToolCallDelta {
	public constructor(
		public readonly index: number,
		public readonly argumentsDelta: string,
		public readonly callId?: string,
		public readonly toolName?: string,
		public readonly signature?: string,
	) {}

	/** True when this delta opens a call rather than continuing one. */
	public get opensCall(): boolean {
		return this.callId !== undefined || this.toolName !== undefined;
	}
}
