import type { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ApprovalDecision, PendingCall } from "./pending-call.value-object";

export class PendingTurn {
	public readonly calls: readonly PendingCall[];

	public constructor(
		public readonly runId: AgentRunId,
		calls: readonly PendingCall[],
	) {
		this.calls = [...calls];
	}

	public get held(): readonly PendingCall[] {
		return this.calls.filter((call) => call.isHeld);
	}

	public get isDecided(): boolean {
		return this.calls.every((call) => !call.isAwaiting);
	}

	public get awaiting(): readonly PendingCall[] {
		return this.calls.filter((call) => call.isAwaiting);
	}

	public find(callId: ToolCallId): PendingCall | undefined {
		return this.calls.find((call) => call.matches(callId));
	}

	public isAwaiting(callId: ToolCallId): boolean {
		return this.find(callId)?.isAwaiting === true;
	}

	public decided(callId: ToolCallId, decision: ApprovalDecision, reason?: string): PendingTurn {
		return new PendingTurn(
			this.runId,
			this.calls.map((call) => (call.matches(callId) ? call.decidedAs(decision, reason) : call)),
		);
	}
}
