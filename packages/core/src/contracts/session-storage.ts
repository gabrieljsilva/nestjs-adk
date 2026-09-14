import type { SessionRevision } from "../common/revision/session-revision";
import type { ContextCheckpoint } from "../domain/context/context-checkpoint";
import type { StoredSessionEvent } from "../domain/event/stored-session-event";
import type { SessionContext } from "../domain/run/session-context";
import { SessionNotFoundError } from "../domain/session/errors/session-not-found.error";
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
 * event id written twice is written once. An adapter that cannot promise all four says
 * so through its capabilities, and the contract suite holds it only to what it claimed.
 *
 * `readEvents` returns an async iterable because rehydration streams the tail: a
 * session with a long history must never be materialized in memory to be replayed.
 *
 * Every method takes the context first, and it names the session: nothing here is passed
 * an id alongside one, because two ways of saying which conversation is meant is one way
 * too many. What the context adds is the session's own metadata, which is how an adapter
 * routes a write without the runtime having to know it shards. On a read that has not
 * happened yet the metadata is empty, since it is the fold of the journal about to be
 * read; a write always carries what the run already folded.
 */
export abstract class SessionStorage {
	public abstract capabilities(): StorageCapabilities;

	public abstract create(context: SessionContext, session: Session): Promise<void>;

	public abstract find(context: SessionContext): Promise<Session | undefined>;

	/** The session, or the error every caller of this port would otherwise write itself. */
	public async findOrFail(context: SessionContext): Promise<Session> {
		const session = await this.find(context);
		if (session === undefined) throw new SessionNotFoundError(context.sessionId.value);
		return session;
	}

	public abstract append(context: SessionContext, command: AppendEventsCommand): Promise<AppendEventsResult>;

	public abstract readEvents(context: SessionContext, afterRevision: SessionRevision): AsyncIterable<StoredSessionEvent>;

	/** Removes head, journal and snapshots together; a missing session is not an error. */
	public abstract delete(context: SessionContext): Promise<void>;

	public abstract saveSnapshot(context: SessionContext, snapshot: SessionSnapshot): Promise<void>;

	public abstract findSnapshot(context: SessionContext): Promise<SessionSnapshot | undefined>;

	/**
	 * Writes a context checkpoint into its own logical collection.
	 *
	 * Checkpoints are not journal: no contiguous revision, no optimistic concurrency and
	 * no place in the commit transaction. Writing the same checkpoint twice writes it
	 * once, keyed by session, covered revision and strategy version.
	 */
	public abstract saveCheckpoint(context: SessionContext, checkpoint: ContextCheckpoint): Promise<void>;

	/** The furthest checkpoint of a session, or nothing when it has none. */
	public abstract findCheckpoint(context: SessionContext): Promise<ContextCheckpoint | undefined>;
}
