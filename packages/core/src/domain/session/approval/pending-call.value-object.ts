import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";

/** What a human answered about one call, once they answered. */
export type ApprovalDecision = "granted" | "denied";

/**
 * One call of a suspended turn, and what has been decided about it.
 *
 * Every call of the turn is here, not only the ones a policy held, and each carries the
 * arguments it will run with: what a human agreed to was that call with those arguments.
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

	public get isHeld(): boolean {
		return this.effect !== undefined;
	}

	public get isDecided(): boolean {
		return this.decision !== undefined;
	}

	public get isDenied(): boolean {
		return this.decision === "denied";
	}

	public get isAwaiting(): boolean {
		return this.isHeld && !this.isDecided;
	}

	public matches(callId: ToolCallId): boolean {
		return this.callId.equals(callId);
	}

	public decidedAs(decision: ApprovalDecision, reason?: string): PendingCall {
		return new PendingCall(this.callId, this.toolName, this.args, this.effect, decision, reason);
	}
}
