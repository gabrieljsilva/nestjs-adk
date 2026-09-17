import type { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { SessionMetadata } from "../session/metadata/session-metadata.value-object";
import type { Session } from "../session/session.entity";
import type { SessionState } from "../session/state/session-state.value-object";

/**
 * What a component is told about the conversation it is acting on, with no run around it:
 * the session id, what the application knows about it, and how far its journal has advanced.
 *
 * A port that declares this one also accepts a `RunContext`, which is this plus the invocation.
 */
export class SessionContext {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly metadata: SessionMetadata = SessionMetadata.empty(),
		public readonly revision: SessionRevision = SessionRevision.initial(),
	) {}

	public static fromSession(session: Session, state?: SessionState): SessionContext {
		return new SessionContext(
			session.id,
			state?.metadata ?? SessionMetadata.empty(),
			state?.revision ?? session.revision,
		);
	}

	public static fromSessionId(sessionId: SessionId): SessionContext {
		return new SessionContext(sessionId);
	}
}
