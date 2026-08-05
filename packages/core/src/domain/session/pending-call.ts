import type { ToolCallId } from "../../common/identity/tool-call-id";

/** What a human answered about one call, once they answered. */
export type ApprovalDecision = "granted" | "denied";

/**
 * One call of a turn that stopped, and what has been decided about it.
 *
 * Every call of the turn is here, not only the ones a policy held: the turn is what was
 * suspended, so the turn is what has to be replayable. A call with an effect is one
 * somebody has to answer for, and a call without one runs as soon as the turn is released.
 *
 * The arguments travel with it because the process that runs them later may never have
 * seen the run that produced them, and rebuilding a call from a guess is the one thing
 * approval exists to prevent.
 */
export class PendingCall {
	public constructor(
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly args: Record<string, unknown>,
		public readonly effect?: string,
		public readonly decision?: ApprovalDecision,
		public readonly reason?: string,
	) {}

	/** Held calls are the ones a policy stopped, and the only ones a decision applies to. */
	public get isHeld(): boolean {
		return this.effect !== undefined;
	}

	public get isDecided(): boolean {
		return this.decision !== undefined;
	}

	public get isDenied(): boolean {
		return this.decision === "denied";
	}

	/** Held, and still nobody's answer: the state that keeps a session suspended. */
	public get isAwaiting(): boolean {
		return this.isHeld && !this.isDecided;
	}

	public isFor(callId: ToolCallId): boolean {
		return this.callId.equals(callId);
	}

	public decidedAs(decision: ApprovalDecision, reason?: string): PendingCall {
		return new PendingCall(this.callId, this.toolName, this.args, this.effect, decision, reason);
	}
}
