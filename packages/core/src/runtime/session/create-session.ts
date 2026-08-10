import type { IdGenerator } from "../../common/identity/id-generator";
import { SessionId } from "../../common/identity/session-id";
import type { Clock } from "../../common/time/clock";
import type { AgentName } from "../../domain/agent/agent-name";
import type { CreateSessionInput } from "../../domain/session/create-session-input";
import { Session } from "../../domain/session/session";
import type { SessionManager } from "./session-manager";

/**
 * Opens a conversation before anything is asked in it.
 *
 * Only the head is written. The journal still begins with the first question, because
 * every event carries the run that produced it and a conversation opened outside a run has
 * none to carry: a `SessionCreated` invented here would name a run that never existed.
 * What that costs is nothing, because `SessionOpener` decides a journal has begun by
 * looking at the journal rather than by remembering who created the head.
 *
 * Existence is not checked before writing. Two requests opening the same chat is the
 * ordinary case, not the exotic one, and a read followed by a write loses that race by
 * construction: the storage refuses the second `create` with `SessionAlreadyExistsError`,
 * inside its own transaction, which is the only place the answer can be correct.
 */
export class CreateSession {
	public constructor(
		private readonly sessions: SessionManager,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
	) {}

	public async handle(agent: AgentName, input: CreateSessionInput): Promise<Session> {
		const session = Session.start(
			input.sessionId ?? SessionId.from(this.ids.next()),
			agent,
			this.clock.now(),
			input.owner,
		);
		await this.sessions.create(session);
		return session;
	}
}
