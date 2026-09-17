import type { SessionRevision } from "../../../common/revision/session-revision.value-object";
import { AppendEventsResult } from "../../../contracts/storage/append-events-result.value-object";
import type { AppendEventsCommand } from "../../../contracts/storage/append-events.command";
import { SessionStorage } from "../../../contracts/storage/session-storage.contract";
import { StorageCapabilities } from "../../../contracts/storage/storage-capabilities.value-object";
import type { ContextCheckpoint } from "../../../domain/context/context-checkpoint.value-object";
import { SessionEventCodecs } from "../../../domain/event/session-event-codecs.factory";
import type { SessionEventRegistry } from "../../../domain/event/session-event-registry.service";
import type { StoredSessionEvent } from "../../../domain/event/stored-session-event.record";
import type { SessionContext } from "../../../domain/run/session-context.value-object";
import { JournalCorruptedError } from "../../../domain/session/errors/journal-corrupted.error";
import { SessionAlreadyExistsError } from "../../../domain/session/errors/session-already-exists.error";
import { SessionNotFoundError } from "../../../domain/session/errors/session-not-found.error";
import { SessionRevisionConflictError } from "../../../domain/session/errors/session-revision-conflict.error";
import type { Session } from "../../../domain/session/session.entity";
import type { SessionSnapshot } from "../../../domain/session/state/session-snapshot.value-object";
import { StorageCodecs } from "../codec/storage-codecs.value-object";
import { UnsupportedStorageFeatureError } from "./errors/unsupported-storage-feature.error";
import { EventRepository } from "./event-repository.adapter";
import { SessionRepository } from "./session-repository.adapter";
import { SnapshotRepository } from "./snapshot-repository.adapter";
import { SqliteConnection } from "./sqlite-connection.adapter";

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
		// The same codecs an adapter outside this package is given, so a row here and a row
		// downstream never drift into meaning two different things.
		const codecs = StorageCodecs.standard(registry);
		this.sessions = new SessionRepository(connection, codecs.head);
		this.events = new EventRepository(connection, codecs.journal);
		this.snapshots = new SnapshotRepository(connection, codecs.snapshot);
	}

	/** Opens a database file, or an in memory one when no path is given. */
	public static at(location: string): SqliteSessionStorage {
		return new SqliteSessionStorage(new SqliteConnection(location));
	}

	public capabilities(): StorageCapabilities {
		return StorageCapabilities.concurrent({ snapshots: true, checkpoints: false });
	}

	public async create(_context: SessionContext, session: Session): Promise<void> {
		if (this.sessions.find(session.id) !== undefined) throw new SessionAlreadyExistsError(session.id.value);
		this.sessions.insert(session);
	}

	public async find(context: SessionContext): Promise<Session | undefined> {
		return this.sessions.find(context.sessionId);
	}

	public async append(_context: SessionContext, command: AppendEventsCommand): Promise<AppendEventsResult> {
		return this.connection.transaction(() => this.appendWithin(command));
	}

	public async *readEvents(context: SessionContext, afterRevision: SessionRevision): AsyncIterable<StoredSessionEvent> {
		const sessionId = context.sessionId;
		if (this.sessions.find(sessionId) === undefined) throw new SessionNotFoundError(sessionId.value);
		for (const stored of this.events.after(sessionId, afterRevision)) yield stored;
	}

	public async delete(context: SessionContext): Promise<void> {
		const sessionId = context.sessionId;
		this.connection.transaction(() => {
			this.events.deleteAll(sessionId);
			this.snapshots.delete(sessionId);
			this.sessions.delete(sessionId);
		});
	}

	public async saveSnapshot(_context: SessionContext, snapshot: SessionSnapshot): Promise<void> {
		if (this.sessions.find(snapshot.sessionId) === undefined) {
			throw new SessionNotFoundError(snapshot.sessionId.value);
		}
		this.snapshots.save(snapshot);
	}

	public async findSnapshot(context: SessionContext): Promise<SessionSnapshot | undefined> {
		return this.snapshots.find(context.sessionId);
	}

	public async saveCheckpoint(_context: SessionContext, _checkpoint: ContextCheckpoint): Promise<void> {
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
