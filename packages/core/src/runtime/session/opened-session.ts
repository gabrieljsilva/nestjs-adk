import type { Session } from "../../domain/session/session";
import type { SessionState } from "../../domain/session/session-state";

/**
 * The session a command is about to run against, however it got there.
 *
 * Whether it was just created or brought back from a journal changes exactly one thing:
 * a session that already existed has its creation recorded, and writing that fact twice
 * would give a reader two beginnings for one conversation.
 */
export class OpenedSession {
	public constructor(
		public readonly session: Session,
		public readonly state: SessionState,
		public readonly isNew: boolean,
	) {}
}
