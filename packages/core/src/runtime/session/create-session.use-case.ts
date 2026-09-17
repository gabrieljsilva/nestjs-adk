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

	private async record(session: Session, agent: AgentName, input: CreateSessionInput): Promise<Session> {
		const started = this.runs.start(session.id, agent);
		return await this.runs.untilFinished(started, async () => {
			const state = await this.sessions.commit(
				new SessionContext(session.id, input.metadata, session.revision),
				session.revision,
				new SessionEventBatch([...this.journal.metadata(started, input.metadata)]),
				SessionState.initial(),
			);
			return session.at(state.revision, this.clock.now());
		});
	}
}
