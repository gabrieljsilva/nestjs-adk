import type { Session } from "../../domain/session/session.entity";
import type { SessionState } from "../../domain/session/state/session-state.value-object";

/**
 * The session a command is about to run against, however it got there.
 *
 * `isNew` is about the journal and not about who wrote the head: it says this conversation
 * has no beginning recorded yet, so the run about to happen is the one that records it.
 * A session opened ahead of time by `CreateSession` and one created by this very command
 * are both in that position, and a conversation that already has a first event is not,
 * because writing that fact twice would give a reader two beginnings for one conversation.
 */
export class OpenedSession {
	public constructor(
		public readonly session: Session,
		public readonly state: SessionState,
		public readonly isNew: boolean,
	) {}
}
