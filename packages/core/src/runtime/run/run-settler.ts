import type { SessionId } from "../../common/identity/session-id";
import type { SessionEvent } from "../../domain/event/session-event";
import { SessionEventBatch } from "../../domain/event/session-event-batch";
import type { SessionState } from "../../domain/session/session-state";
import type { SessionManager } from "../session/session-manager";
import type { RunJournal } from "./run-journal";
import type { StartedRun } from "./started-run";

/**
 * Records how a run ended, without replacing the failure the caller has to see.
 *
 * The revision the run was holding may already be behind, because a commit that failed on
 * a conflict is one of the ways a run ends here. So the terminal event is written again
 * against the head the journal actually has.
 *
 * A journal that refuses it twice is a second problem, and reporting it instead of the
 * first would hide the reason the run stopped at all. It goes to the observers as a fact
 * that never became durable, and the caller still gets the failure that caused it. What
 * never happens is silence: a run left looking like it is still going is the one state
 * nobody can act on.
 */
export class RunSettler {
	public constructor(
		private readonly sessions: SessionManager,
		private readonly journal: RunJournal,
	) {}

	public async settle(sessionId: SessionId, state: SessionState, started: StartedRun, error: unknown): Promise<void> {
		const terminal = this.journal.terminal(started, error);
		try {
			await this.commit(sessionId, state.revision, state, terminal);
		} catch {
			await this.rebase(sessionId, terminal);
		}
	}

	private async rebase(sessionId: SessionId, terminal: SessionEvent): Promise<void> {
		try {
			const rehydrated = await this.sessions.rehydrate(sessionId);
			await this.commit(sessionId, rehydrated.session.revision, rehydrated.state, terminal);
		} catch {
			await this.sessions.announce(sessionId, terminal);
		}
	}

	private async commit(
		sessionId: SessionId,
		revision: SessionState["revision"],
		state: SessionState,
		terminal: SessionEvent,
	): Promise<void> {
		await this.sessions.commit(sessionId, revision, SessionEventBatch.of([terminal]), state);
	}
}
