import type { SessionId } from "../common/identity/session-id";
import type { SessionRevision } from "../common/revision/session-revision";
import type { ContextCheckpoint } from "../domain/context/context-checkpoint";
import type { StoredSessionEvent } from "../domain/event/stored-session-event";
import type { Session } from "../domain/session/session";
import type { SessionSnapshot } from "../domain/session/session-snapshot";
import type { AppendEventsCommand } from "./append-events-command";
import type { AppendEventsResult } from "./append-events-result";
import type { StorageCapabilities } from "./storage-capabilities";

/**
 * Where sessions and their journals live.
 *
 * Four guarantees define a correct adapter: a batch is written whole or not at all,
 * `expectedRevision` decides who wins a race, revisions are contiguous, and the same
 * event id written twice is written once. An adapter that cannot promise all four
 * says so through its capabilities and is refused durable sessions.
 *
 * `readEvents` returns an async iterable because rehydration streams the tail: a
 * session with a long history must never be materialized in memory to be replayed.
 */
export abstract class SessionStorage {
	public abstract capabilities(): StorageCapabilities;

	public abstract create(session: Session): Promise<void>;

	public abstract find(sessionId: SessionId): Promise<Session | undefined>;

	public abstract findOrFail(sessionId: SessionId): Promise<Session>;

	public abstract append(command: AppendEventsCommand): Promise<AppendEventsResult>;

	public abstract readEvents(sessionId: SessionId, afterRevision: SessionRevision): AsyncIterable<StoredSessionEvent>;

	/** Removes head, journal and snapshots together; a missing session is not an error. */
	public abstract delete(sessionId: SessionId): Promise<void>;

	public abstract saveSnapshot(snapshot: SessionSnapshot): Promise<void>;

	public abstract findSnapshot(sessionId: SessionId): Promise<SessionSnapshot | undefined>;

	/**
	 * Writes a context checkpoint into its own logical collection.
	 *
	 * Checkpoints are not journal: no contiguous revision, no optimistic concurrency and
	 * no place in the commit transaction. Writing the same checkpoint twice writes it
	 * once, keyed by session, covered revision and strategy version.
	 */
	public abstract saveCheckpoint(checkpoint: ContextCheckpoint): Promise<void>;

	/** The furthest checkpoint of a session, or nothing when it has none. */
	public abstract findCheckpoint(sessionId: SessionId): Promise<ContextCheckpoint | undefined>;
}
