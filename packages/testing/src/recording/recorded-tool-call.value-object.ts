/**
 * How a tool call ended: it ran, it raised, a human refused it, or it is still waiting on one.
 */
export type ToolCallOutcome = "succeeded" | "failed" | "denied" | "pending";

/**
 * One tool call as it happened: the tool, the arguments the model sent, the output it got back
 * and how the call ended.
 */
export class RecordedToolCall {
	private constructor(
		public readonly callId: string,
		public readonly tool: string,
		public readonly args: Readonly<Record<string, unknown>>,
		public readonly outcome: ToolCallOutcome,
		public readonly output?: Readonly<Record<string, unknown>>,
		public readonly deniedReason?: string,
	) {}

	public static requested(callId: string, tool: string, args: Readonly<Record<string, unknown>>): RecordedToolCall {
		return new RecordedToolCall(callId, tool, args, "pending");
	}

	public settledWith(output: Readonly<Record<string, unknown>>, failed: boolean): RecordedToolCall {
		if (this.outcome === "denied")
			return new RecordedToolCall(this.callId, this.tool, this.args, "denied", output, this.deniedReason);
		return new RecordedToolCall(this.callId, this.tool, this.args, failed ? "failed" : "succeeded", output);
	}

	public deniedBecause(reason: string): RecordedToolCall {
		return new RecordedToolCall(this.callId, this.tool, this.args, "denied", this.output, reason);
	}

	public get hasRun(): boolean {
		return this.outcome === "succeeded" || this.outcome === "failed";
	}
}
