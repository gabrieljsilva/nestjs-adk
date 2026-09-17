import type { IdGenerator } from "../../common/identity/id-generator.contract";
import { SessionId } from "../../common/identity/session-id.value-object";
import type { Clock } from "../../common/time/clock.contract";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import { SessionEventBatch } from "../../domain/event/session-event-batch.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import type { CreateSessionInput } from "../../domain/session/input/create-session-input.command";
import { Session } from "../../domain/session/session.entity";
import { SessionState } from "../../domain/session/state/session-state.value-object";
import type { AgentRunFactory } from "../run/agent-run.factory";
import type { RunJournal } from "../run/journal/run-journal.service";
import type { SessionRepository } from "./session-repository.service";

/**
 * Opens a conversation before anything is asked in it.
 *
 * Only the head is written when nothing was said about the conversation. The journal still
 * begins with the first question, because every event carries the run that produced it and a
 * conversation opened outside a run has none to carry: a `SessionCreated` invented here would
 * name a run that never existed.
 *
 * Metadata is the one thing that does get written, because it is durable and there is nowhere
 * else it could live: the head holds no application facts, and a value kept in memory until
 * the first question would be lost by the process that opened the chat. It is committed under
 * the run that opened the session, which did happen, and the first question still records the
 * conversation beginning because `SessionOpener` decides that by looking at the projection
 * rather than at the revision.
 *
 * Existence is not checked before writing. Two requests opening the same chat is the
 * ordinary case, not the exotic one, and a read followed by a write loses that race by
 * construction: the storage refuses the second `create` with `SessionAlreadyExistsError`,
 * inside its own transaction, which is the only place the answer can be correct.
 */
export class CreateSessionUseCase {
	public constructor(
		private readonly sessions: SessionRepository,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly runs: AgentRunFactory,
		private readonly journal: RunJournal,
	) {}

	public async execute(agent: AgentName, input: CreateSessionInput): Promise<Session> {
		const session = Session.start(input.sessionId ?? SessionId.from(this.ids.next()), agent, this.clock.now());
		await this.sessions.create(new SessionContext(session.id, input.metadata, session.revision), session);
		if (input.metadata.isEmpty) return session;
		return await this.record(session, agent, input);
	}

	/** The metadata of a conversation nobody has asked anything in yet, as events of its own run. */
	private async record(session: Session, agent: AgentName, input: CreateSessionInput): Promise<Session> {
		const started = this.runs.start(session.id, agent);
		try {
			const state = await this.sessions.commit(
				new SessionContext(session.id, input.metadata, session.revision),
				session.revision,
				new SessionEventBatch([...this.journal.metadata(started, input.metadata)]),
				SessionState.initial(),
			);
			return session.at(state.revision, this.clock.now());
		} finally {
			this.runs.finish(started.run);
		}
	}
}
