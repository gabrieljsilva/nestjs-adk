import { type RunContext, ToolCallNotice, ToolCallObserver, type ToolResultNotice } from "@nestjs-adk/core";

/** One call the store is waiting on a person for, as a front end would render it. */
export class HeldCall {
	public constructor(
		public readonly callId: string,
		public readonly toolName: string,
		public readonly effect: string,
		public readonly args: Readonly<Record<string, unknown>>,
	) {}

	public static of(notice: ToolCallNotice): HeldCall {
		return new HeldCall(notice.callId.value, notice.toolName, notice.effect?.name ?? "unknown", notice.args);
	}

	/** What the button says, which is the whole reason the arguments travel with the call. */
	public get question(): string {
		return `Approve ${this.toolName} (${this.effect}) with ${JSON.stringify(this.args)}?`;
	}
}

/**
 * What the store does with the tool calls of a run: draw a card for the ones a person has
 * to answer, and take it down when the answer lands.
 *
 * This is the consumer side of human approval. The runtime suspends the run and the journal
 * remembers it; what nothing in the library can know is how this application wants to ask.
 * Here that is a list somebody reads. In the real store it would be a row written to the
 * database the operator's screen polls, and the code would be the same shape: `requested`
 * writes, `settled` closes.
 *
 * Two things it deliberately does not do. It does not ask the approval policy anything:
 * `isHeld` is the gate's own verdict, taken once inside the run, and asking again from out
 * here is two answers to one security question. And it holds nothing between a suspension
 * and a decision: the board is rebuilt from what this run was told, so an approval that
 * arrives at another process brings its own board rather than looking for this one.
 */
export class HeldCallBoard extends ToolCallObserver {
	private readonly held = new Map<string, HeldCall>();
	private readonly closed: string[] = [];

	/** Everything still waiting for a person, in the order the model asked for it. */
	public get awaiting(): readonly HeldCall[] {
		return [...this.held.values()];
	}

	/** The calls that came back, held or not, which is what a transcript shows. */
	public get settledCalls(): readonly string[] {
		return this.closed;
	}

	public requested(_context: RunContext, call: ToolCallNotice): void {
		if (!call.isHeld) return;
		this.held.set(call.callId.value, HeldCall.of(call));
	}

	public settled(_context: RunContext, result: ToolResultNotice): void {
		this.held.delete(result.callId.value);
		this.closed.push(result.toolName);
	}
}
