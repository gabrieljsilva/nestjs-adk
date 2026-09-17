import type { ToolCallId } from "../../../common/identity/tool-call-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import type { AgentName } from "../../agent/agent-name";
import type { PromptMeasurement } from "../../model/usage/prompt-measurement";
import type { ApprovalDecision } from "../approval/pending-call";
import type { PendingTurn } from "../approval/pending-turn";
import { SessionMetadata } from "../metadata/session-metadata";
import { StateValues } from "./state-values";

/**
 * What the journal projects to: where the session stands right now.
 *
 * It is a value, not a store. Applying an event returns a new state, so replaying the
 * same events always lands on the same place and nothing can be changed behind a run.
 *
 * The last prompt measurement lives here because it is a decision input rather than
 * conversation: without it a session brought back from storage has no size at all, and
 * every budget question it is asked has to be answered with an absence.
 */
export class SessionState {
	private constructor(
		public readonly revision: SessionRevision,
		public readonly values: StateValues,
		public readonly activeAgent?: AgentName,
		public readonly lastPrompt?: PromptMeasurement,
		public readonly pendingTurn?: PendingTurn,
		/** What the application knows about this session, folded from the metadata events. */
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

	/** One call was answered; the turn stays until every held call of it has been. */
	public decided(callId: ToolCallId, decision: ApprovalDecision, reason?: string): SessionState {
		const turn = this.pendingTurn;
		return turn === undefined ? this : this.withTurn(turn.decided(callId, decision, reason));
	}

	/** The turn ran, so there is nothing left to resume. */
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
