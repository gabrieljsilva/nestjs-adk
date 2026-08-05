import type { SessionId } from "../../../common/identity/session-id";
import type { SessionRevision } from "../../../common/revision/session-revision";
import type { AppendEventsCommand } from "../../../contracts/append-events-command";
import { AppendEventsResult } from "../../../contracts/append-events-result";
import { SessionStorage } from "../../../contracts/session-storage";
import { StorageCapabilities } from "../../../contracts/storage-capabilities";
import type { ContextCheckpoint } from "../../../domain/context/context-checkpoint";
import { SessionEventCodecs } from "../../../domain/event/session-event-codecs";
import type { SessionEventRegistry } from "../../../domain/event/session-event-registry";
import type { StoredSessionEvent } from "../../../domain/event/stored-session-event";
import { JournalCorruptedError } from "../../../domain/session/errors/journal-corrupted.error";
import { SessionAlreadyExistsError } from "../../../domain/session/errors/session-already-exists.error";
import { SessionNotFoundError } from "../../../domain/session/errors/session-not-found.error";
import { SessionRevisionConflictError } from "../../../domain/session/errors/session-revision-conflict.error";
import type { Session } from "../../../domain/session/session";
import type { SessionSnapshot } from "../../../domain/session/session-snapshot";
import { SessionStateCodec } from "../../../domain/session/session-state-codec";
import { UnsupportedStorageFeatureError } from "./errors/unsupported-storage-feature.error";
import { EventRepository } from "./event-repository";
import { SessionRepository } from "./session-repository";
import { SnapshotRepository } from "./snapshot-repository";
import { SqliteConnection } from "./sqlite-connection";

/**
 * A durable session store on the SQLite that ships with Node.
 *
 * It orchestrates repositories and owns every decision they deliberately do not: whether
 * an append is a retry, whether the revision is the one the caller expected, and what to
 * do when it is not. The repositories move rows; this is what makes those rows a journal.
 *
 * Atomicity and optimistic concurrency both come from one immediate transaction around the
 * append: the revision is read and written inside it, so two processes racing on the same
 * session resolve by `expectedRevision` and never by who happened to be scheduled first.
 *
 * Context checkpoints are not stored. They are an optimization for compaction, and the
 * capability says so rather than the adapter accepting one and losing it.
 */
export class SqliteSessionStorage extends SessionStorage {
	private readonly sessions: SessionRepository;
	private readonly events: EventRepository;
	private readonly snapshots: SnapshotRepository;

	public constructor(
		private readonly connection: SqliteConnection = new SqliteConnection(),
		registry: SessionEventRegistry = SessionEventCodecs.registry(),
	) {
		super();
		this.sessions = new SessionRepository(connection);
		this.events = new EventRepository(connection, registry);
		this.snapshots = new SnapshotRepository(connection, new SessionStateCodec());
	}

	/** Opens a database file, or an in memory one when no path is given. */
	public static at(location: string): SqliteSessionStorage {
		return new SqliteSessionStorage(new SqliteConnection(location));
	}

	public capabilities(): StorageCapabilities {
		return StorageCapabilities.durable({ snapshots: true, checkpoints: false });
	}

	public async create(session: Session): Promise<void> {
		if (this.sessions.find(session.id) !== undefined) throw new SessionAlreadyExistsError(session.id.value);
		this.sessions.insert(session);
	}

	public async find(sessionId: SessionId): Promise<Session | undefined> {
		return this.sessions.find(sessionId);
	}

	public async findOrFail(sessionId: SessionId): Promise<Session> {
		const session = this.sessions.find(sessionId);
		if (session === undefined) throw new SessionNotFoundError(sessionId.value);
		return session;
	}

	public async append(command: AppendEventsCommand): Promise<AppendEventsResult> {
		return this.connection.transaction(() => this.appendWithin(command));
	}

	public async *readEvents(sessionId: SessionId, afterRevision: SessionRevision): AsyncIterable<StoredSessionEvent> {
		if (this.sessions.find(sessionId) === undefined) throw new SessionNotFoundError(sessionId.value);
		for (const stored of this.events.after(sessionId, afterRevision)) yield stored;
	}

	public async delete(sessionId: SessionId): Promise<void> {
		this.connection.transaction(() => {
			this.events.deleteAll(sessionId);
			this.snapshots.delete(sessionId);
			this.sessions.delete(sessionId);
		});
	}

	public async saveSnapshot(snapshot: SessionSnapshot): Promise<void> {
		if (this.sessions.find(snapshot.sessionId) === undefined) {
			throw new SessionNotFoundError(snapshot.sessionId.value);
		}
		this.snapshots.save(snapshot);
	}

	public async findSnapshot(sessionId: SessionId): Promise<SessionSnapshot | undefined> {
		return this.snapshots.find(sessionId);
	}

	public async saveCheckpoint(_checkpoint: ContextCheckpoint): Promise<void> {
		throw new UnsupportedStorageFeatureError("context checkpoints");
	}

	public async findCheckpoint(): Promise<ContextCheckpoint | undefined> {
		return undefined;
	}

	public close(): void {
		this.connection.close();
	}

	private appendWithin(command: AppendEventsCommand): AppendEventsResult {
		const session = this.sessions.find(command.sessionId);
		if (session === undefined) throw new SessionNotFoundError(command.sessionId.value);

		const replayed = this.replayOf(command);
		if (replayed !== undefined) return new AppendEventsResult(replayed, session.revision);

		if (!session.revision.equals(command.expectedRevision)) {
			throw new SessionRevisionConflictError(
				command.sessionId.value,
				command.expectedRevision.value,
				session.revision.value,
			);
		}

		let revision = session.revision;
		const committed: StoredSessionEvent[] = [];
		for (const event of command.batch.events) {
			revision = revision.next();
			this.events.append(command.sessionId, revision, event);
			committed.push(...this.events.byIds(command.sessionId, [event.id.value]));
		}
		this.sessions.advance(session.at(revision, session.updatedAt));
		return new AppendEventsResult(committed, revision);
	}

	/**
	 * A retry of a batch that already landed answers with what was written before.
	 * Idempotency is keyed by event id; the same id carrying different content is not a
	 * retry, it is corruption, and it stops the write.
	 */
	private replayOf(command: AppendEventsCommand): readonly StoredSessionEvent[] | undefined {
		const ids = command.batch.events.map((event) => event.id.value);
		const written = this.events.writtenPayloads(command.sessionId, ids);
		if (written.size === 0) return undefined;

		for (const event of command.batch.events) {
			const before = written.get(event.id.value);
			if (before === undefined) {
				throw new JournalCorruptedError(command.sessionId.value, "a batch was partially written before.");
			}
			if (before !== this.events.fingerprintOf(event)) {
				throw new JournalCorruptedError(
					command.sessionId.value,
					`event ${event.id.value} was already written with different content.`,
				);
			}
		}
		return this.events.byIds(command.sessionId, ids);
	}
}
