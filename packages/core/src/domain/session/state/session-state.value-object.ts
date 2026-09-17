import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { SessionRevision } from "../../../common/revision/session-revision.value-object";
import type { AgentName } from "../../agent/agent-name.value-object";
import type { PromptMeasurement } from "../../model/usage/prompt-measurement.value-object";
import type { ApprovalDecision } from "../approval/pending-call.value-object";
import type { PendingTurn } from "../approval/pending-turn.value-object";
import { SessionMetadata } from "../metadata/session-metadata.value-object";
import { StateValues } from "./state-values.value-object";

export class SessionState {
	private constructor(
		public readonly revision: SessionRevision,
		public readonly values: StateValues,
		public readonly activeAgent?: AgentName,
		public readonly lastPrompt?: PromptMeasurement,
		public readonly pendingTurn?: PendingTurn,
		public readonly metadata: SessionMetadata = SessionMetadata.empty(),
	) {}

	public static initial(): SessionState {
		return new SessionState(SessionRevision.initial(), StateValues.empty());
	}

	public static restored(
		revision: SessionRevision,
		values: StateValues,
		activeAgent?: AgentName,
		lastPrompt?: PromptMeasurement,
		pendingTurn?: PendingTurn,
		metadata: SessionMetadata = SessionMetadata.empty(),
	): SessionState {
		return new SessionState(revision, values, activeAgent, lastPrompt, pendingTurn, metadata);
	}

	public at(revision: SessionRevision): SessionState {
		return new SessionState(revision, this.values, this.activeAgent, this.lastPrompt, this.pendingTurn, this.metadata);
	}

	public withValues(values: StateValues): SessionState {
		return new SessionState(this.revision, values, this.activeAgent, this.lastPrompt, this.pendingTurn, this.metadata);
	}

	public withMetadata(metadata: SessionMetadata): SessionState {
		return new SessionState(this.revision, this.values, this.activeAgent, this.lastPrompt, this.pendingTurn, metadata);
	}

	public withActiveAgent(agent: AgentName): SessionState {
		return new SessionState(this.revision, this.values, agent, this.lastPrompt, this.pendingTurn, this.metadata);
	}

	public withLastPrompt(measurement: PromptMeasurement): SessionState {
		return new SessionState(this.revision, this.values, this.activeAgent, measurement, this.pendingTurn, this.metadata);
	}

	public awaiting(turn: PendingTurn): SessionState {
		return this.withTurn(turn);
	}

	public decided(callId: ToolCallId, decision: ApprovalDecision, reason?: string): SessionState {
		const turn = this.pendingTurn;
		return turn === undefined ? this : this.withTurn(turn.decided(callId, decision, reason));
	}

	public released(): SessionState {
		return this.withTurn(undefined);
	}

	public get isAwaitingApproval(): boolean {
		return this.pendingTurn?.isDecided === false;
	}

	private withTurn(turn?: PendingTurn): SessionState {
		return new SessionState(this.revision, this.values, this.activeAgent, this.lastPrompt, turn, this.metadata);
	}
}
