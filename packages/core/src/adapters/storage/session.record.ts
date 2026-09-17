import type { ContextCheckpoint } from "../../domain/context/context-checkpoint.value-object";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event.record";
import type { Session } from "../../domain/session/session.entity";
import type { SessionSnapshot } from "../../domain/session/state/session-snapshot.value-object";

export class SessionRecord {
	public readonly events: StoredSessionEvent[] = [];

	public readonly checkpoints = new Map<string, ContextCheckpoint>();

	public snapshot?: SessionSnapshot;

	public constructor(public session: Session) {}
}
