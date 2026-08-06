/** Where a tool call ended up, which is a different question from whether it was asked for. */
export type ToolCallOutcome = "succeeded" | "failed" | "denied" | "pending";

/**
 * One tool the model asked for, with what it chose and what came back.
 *
 * The arguments are what the model decided and the output is what the tool answered, both
 * read from the journal rather than from a double, so the same assertion holds whether the
 * run was scripted or a real provider decided it.
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

	/** A call that was asked for and has not come back yet. */
	public static requested(callId: string, tool: string, args: Readonly<Record<string, unknown>>): RecordedToolCall {
		return new RecordedToolCall(callId, tool, args, "pending");
	}

	/**
	 * What the call answered with.
	 *
	 * A refusal is an answer too: a denied call still produces a result the model reads, so
	 * the outcome stays `denied` rather than being overwritten by the refusal travelling back
	 * as an ordinary result.
	 */
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
