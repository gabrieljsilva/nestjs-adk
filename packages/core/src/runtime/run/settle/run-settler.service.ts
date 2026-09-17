import { SessionEventBatch } from "../../../domain/event/session-event-batch.value-object";
import type { SessionEvent } from "../../../domain/event/session-event.event";
import type { SessionContext } from "../../../domain/run/session-context.value-object";
import type { SessionState } from "../../../domain/session/state/session-state.value-object";
import type { SessionRepository } from "../../session/session-repository.service";
import type { RunJournal } from "../journal/run-journal.service";
import type { RunProgress } from "./run-progress.value-object";
import type { StartedRun } from "./started-run.value-object";

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
		private readonly sessions: SessionRepository,
		private readonly journal: RunJournal,
	) {}

	/**
	 * Runs the body, and records how the run ended when it does not reach the end.
	 *
	 * From the first commit on, every ending a run can reach has to be written down, and a
	 * use case that wrote the `try/catch` itself would be one early `return` away from a run
	 * that reads as still going. The failure is rethrown untouched: settling is a record, not
	 * a recovery.
	 */
	public async settling<T>(
		context: SessionContext,
		progress: RunProgress,
		started: StartedRun,
		body: () => Promise<T>,
	): Promise<T> {
		try {
			return await body();
		} catch (error) {
			await this.settle(context, progress.state, started, error);
			throw error;
		}
	}

	public async settle(context: SessionContext, state: SessionState, started: StartedRun, error: unknown): Promise<void> {
		const terminal = this.journal.terminal(started, error);
		try {
			await this.commit(context, state.revision, state, terminal);
		} catch {
			await this.rebase(context, terminal);
		}
	}

	private async rebase(context: SessionContext, terminal: SessionEvent): Promise<void> {
		try {
			const rehydrated = await this.sessions.rehydrate(context);
			await this.commit(context, rehydrated.session.revision, rehydrated.state, terminal);
		} catch {
			await this.sessions.announce(context, terminal);
		}
	}

	private async commit(
		context: SessionContext,
		revision: SessionState["revision"],
		state: SessionState,
		terminal: SessionEvent,
	): Promise<void> {
		await this.sessions.commit(context, revision, new SessionEventBatch([terminal]), state);
	}
}
