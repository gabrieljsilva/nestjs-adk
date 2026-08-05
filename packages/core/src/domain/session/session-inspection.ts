import type { SessionId } from "../../common/identity/session-id";
import type { SessionRevision } from "../../common/revision/session-revision";
import type { AgentName } from "../agent/agent-name";
import type { PromptMeasurement } from "../model/prompt-measurement";
import { ApprovalStatus } from "./approval-status";
import type { Session } from "./session";
import type { SessionState } from "./session-state";
import type { StateValues } from "./state-values";

/**
 * Where a session stands right now, without running anything to find out.
 *
 * It is the read half of the runtime. A conversation that suspended is answered by a
 * process that may never have seen the run that suspended it, and a screen that reloads
 * has to be rebuilt from somewhere: both read this, and both would otherwise have to
 * reach into a journal and project it themselves.
 *
 * The parts stay the values they already are rather than being flattened into one bag.
 * The head of the conversation is a `Session`, what it is waiting for is an
 * `ApprovalStatus`, and how large the last prompt was is a `PromptMeasurement`, so
 * anything that already knows one of them keeps knowing it.
 *
 * Everything here comes from the journal, so it answers the same in any process and
 * survives a restart. What it does not answer is whether a run is executing at this
 * instant: a process that died mid run wrote no ending, and no reader can tell that
 * apart from one still working.
 */
export class SessionInspection {
	private constructor(
		public readonly session: Session,
		public readonly activeAgent: AgentName,
		public readonly approval: ApprovalStatus,
		public readonly values: StateValues,
		public readonly lastPrompt?: PromptMeasurement,
	) {}

	public static of(session: Session, state: SessionState): SessionInspection {
		const turn = state.pendingTurn;
		return new SessionInspection(
			session,
			state.activeAgent ?? session.rootAgent,
			turn === undefined ? ApprovalStatus.none() : ApprovalStatus.of(turn),
			state.values,
			state.lastPrompt,
		);
	}

	public get id(): SessionId {
		return this.session.id;
	}

	/** How far the journal has advanced, which is what tells one read from the next. */
	public get revision(): SessionRevision {
		return this.session.revision;
	}

	/** The one question most callers have: is somebody expected to answer for something. */
	public get isAwaitingApproval(): boolean {
		return this.approval.isAwaiting;
	}

	public get acceptsCommands(): boolean {
		return this.session.acceptsCommands;
	}
}
