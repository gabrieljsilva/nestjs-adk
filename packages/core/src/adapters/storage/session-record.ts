import type { ContextCheckpoint } from "../../domain/context/context-checkpoint";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event";
import type { Session } from "../../domain/session/session";
import type { SessionSnapshot } from "../../domain/session/session-snapshot";

/** Everything the in memory adapter keeps for one session. */
export class SessionRecord {
	public readonly events: StoredSessionEvent[] = [];

	/** Keyed by checkpoint identity, which is what makes a repeated write idempotent. */
	public readonly checkpoints = new Map<string, ContextCheckpoint>();

	public snapshot?: SessionSnapshot;

	public constructor(public session: Session) {}
}
