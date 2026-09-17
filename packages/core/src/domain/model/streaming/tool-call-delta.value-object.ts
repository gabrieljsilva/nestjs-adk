/**
 * Part of a tool call, as it arrives over a stream: the id and name land first, then the
 * arguments as fragments of JSON that only parse once the last one is in.
 * The signature is an opaque token some providers attach and refuse the next turn without.
 */
export class ToolCallDelta {
	public constructor(
		public readonly index: number,
		public readonly argumentsDelta: string,
		public readonly callId?: string,
		public readonly toolName?: string,
		public readonly signature?: string,
	) {}

	public get opensCall(): boolean {
		return this.callId !== undefined || this.toolName !== undefined;
	}
}
