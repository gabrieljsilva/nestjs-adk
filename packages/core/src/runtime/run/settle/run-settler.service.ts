import { SessionEventBatch } from "../../../domain/event/session-event-batch.value-object";
import type { SessionEvent } from "../../../domain/event/session-event.event";
import type { SessionContext } from "../../../domain/run/session-context.value-object";
import type { SessionState } from "../../../domain/session/state/session-state.value-object";
import type { SessionRepository } from "../../session/session-repository.service";
import type { RunJournal } from "../journal/run-journal.service";
import type { RunProgress } from "./run-progress.value-object";
import type { StartedRun } from "./started-run.value-object";

export class RunSettler {
	public constructor(
		private readonly sessions: SessionRepository,
		private readonly journal: RunJournal,
	) {}

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
