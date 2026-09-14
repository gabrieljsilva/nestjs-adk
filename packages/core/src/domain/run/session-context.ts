import type { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import type { Session } from "../session/session";
import { SessionMetadata } from "../session/session-metadata";
import type { SessionState } from "../session/session-state";

/**
 * What a component is told about the conversation it is acting on, with no run around it.
 *
 * Deleting a session, publishing what a commit produced and dropping what a session stored
 * are all things that happen without anybody having asked a question, so a port that
 * demanded a run would have to be handed a fabricated one. This is the honest shape of that
 * moment: the conversation, what the application knows about it, and how far its journal
 * has advanced.
 *
 * Everything on it is durable, which is why the same class is the durable half of a
 * `RunContext`: a run context is this plus the invocation, so a port that only needs the
 * conversation declares this one and accepts both.
 */
export class SessionContext {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly metadata: SessionMetadata = SessionMetadata.empty(),
		public readonly revision: SessionRevision = SessionRevision.initial(),
	) {}

	/** The head and its projection, which is what every open has in hand. */
	public static fromSession(session: Session, state?: SessionState): SessionContext {
		return new SessionContext(
			session.id,
			state?.metadata ?? SessionMetadata.empty(),
			state?.revision ?? session.revision,
		);
	}

	/** All an adapter is given when the conversation is being removed rather than used. */
	public static fromSessionId(sessionId: SessionId): SessionContext {
		return new SessionContext(sessionId);
	}
}
