import type { SessionId } from "../../common/identity/session-id.value-object";
import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { SessionEvent } from "./session-event.event";

/** An event as it sits in the journal: a session, a revision and the fact itself. */
export class StoredSessionEvent {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly revision: SessionRevision,
		public readonly event: SessionEvent,
	) {}
}
