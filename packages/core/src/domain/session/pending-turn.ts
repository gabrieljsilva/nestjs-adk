import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { ApprovalDecision, PendingCall } from "./pending-call";

/**
 * The turn a session is waiting on a human for, whole.
 *
 * A turn is held or released together. A model that asked to look an order up and then
 * to refund it meant one thing, and running the half nobody had to agree to would leave
 * the journal with a call that has no result and a context no provider will accept.
 *
 * Nothing about the paused run stays in memory: everything needed to run the turn later,
 * in another process, is here. The run it came from is recorded so the run that continues
 * can point back at it rather than pretend to be it.
 */
export class PendingTurn {
	private constructor(
		public readonly runId: AgentRunId,
		public readonly calls: readonly PendingCall[],
	) {}

	public static of(runId: AgentRunId, calls: readonly PendingCall[]): PendingTurn {
		return new PendingTurn(runId, [...calls]);
	}

	public get held(): readonly PendingCall[] {
		return this.calls.filter((call) => call.isHeld);
	}

	/** Nobody is waiting anymore, which is what lets the turn run. */
	public get isDecided(): boolean {
		return this.calls.every((call) => !call.isAwaiting);
	}

	public get awaiting(): readonly PendingCall[] {
		return this.calls.filter((call) => call.isAwaiting);
	}

	public find(callId: ToolCallId): PendingCall | undefined {
		return this.calls.find((call) => call.isFor(callId));
	}

	/** Whether this call is one somebody may still answer, which a repeated decision is not. */
	public isAwaiting(callId: ToolCallId): boolean {
		return this.find(callId)?.isAwaiting === true;
	}

	public decided(callId: ToolCallId, decision: ApprovalDecision, reason?: string): PendingTurn {
		return new PendingTurn(
			this.runId,
			this.calls.map((call) => (call.isFor(callId) ? call.decidedAs(decision, reason) : call)),
		);
	}
}
