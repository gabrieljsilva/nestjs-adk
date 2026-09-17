import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { ContextCheckpoint } from "../../domain/context/context-checkpoint.value-object";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event.record";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { SessionNotFoundError } from "../../domain/session/errors/session-not-found.error";
import type { Session } from "../../domain/session/session.entity";
import type { SessionSnapshot } from "../../domain/session/state/session-snapshot.value-object";
import type { AppendEventsResult } from "./append-events-result.value-object";
import type { AppendEventsCommand } from "./append-events.command";
import type { StorageCapabilities } from "./storage-capabilities.value-object";

/**
 * Where sessions and their journals live.
 *
 * Four guarantees define a correct adapter: a batch is written whole or not at all,
 * `expectedRevision` decides who wins a race, revisions are contiguous, and the same event id
 * written twice is written once. An adapter that cannot promise all four says so through its
 * capabilities. `readEvents` streams, so a long history is never materialized to be replayed.
 */
export abstract class SessionStorage {
	public abstract capabilities(): StorageCapabilities;

	public abstract create(context: SessionContext, session: Session): Promise<void>;

	public abstract find(context: SessionContext): Promise<Session | undefined>;

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
	 * Checkpoints are not journal: no contiguous revision and no optimistic concurrency. Writing
	 * the same one twice writes it once, keyed by session, covered revision and strategy version.
	 */
	public abstract saveCheckpoint(context: SessionContext, checkpoint: ContextCheckpoint): Promise<void>;

	public abstract findCheckpoint(context: SessionContext): Promise<ContextCheckpoint | undefined>;
}
