import type { SessionId } from "../../common/identity/session-id.value-object";
import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { AgentName } from "../agent/agent-name.value-object";
import type { PromptMeasurement } from "../model/usage/prompt-measurement.value-object";
import { ApprovalStatus } from "./approval/approval-status.value-object";
import type { SessionMetadata } from "./metadata/session-metadata.value-object";
import type { Session } from "./session.entity";
import type { SessionState } from "./state/session-state.value-object";
import type { StateValues } from "./state/state-values.value-object";

/**
 * Where a session stands right now, without running anything to find out.
 *
 * Everything here is projected from the journal, so it answers the same in any process and
 * survives a restart. It does not answer whether a run is executing at this instant.
 */
export class SessionInspection {
	private constructor(
		public readonly session: Session,
		public readonly activeAgent: AgentName,
		public readonly approval: ApprovalStatus,
		public readonly values: StateValues,
		public readonly metadata: SessionMetadata,
		public readonly lastPrompt?: PromptMeasurement,
	) {}

	public static fromSession(session: Session, state: SessionState): SessionInspection {
		const turn = state.pendingTurn;
		return new SessionInspection(
			session,
			state.activeAgent ?? session.rootAgent,
			turn === undefined ? ApprovalStatus.none() : ApprovalStatus.fromTurn(turn),
			state.values,
			state.metadata,
			state.lastPrompt,
		);
	}

	public get id(): SessionId {
		return this.session.id;
	}

	public get revision(): SessionRevision {
		return this.session.revision;
	}

	public get isAwaitingApproval(): boolean {
		return this.approval.isAwaiting;
	}

	public get acceptsCommands(): boolean {
		return this.session.acceptsCommands;
	}
}
