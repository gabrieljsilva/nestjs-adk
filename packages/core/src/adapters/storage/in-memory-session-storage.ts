import type { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import type { AppendEventsCommand } from "../../contracts/append-events-command";
import { AppendEventsResult } from "../../contracts/append-events-result";
import { SessionStorage } from "../../contracts/session-storage";
import { StorageCapabilities } from "../../contracts/storage-capabilities";
import type { ContextCheckpoint } from "../../domain/context/context-checkpoint";
import type { SessionEvent } from "../../domain/event/session-event";
import { SessionEventCodecs } from "../../domain/event/session-event-codecs";
import type { SessionEventRegistry } from "../../domain/event/session-event-registry";
import { StoredSessionEvent } from "../../domain/event/stored-session-event";
import { JournalCorruptedError } from "../../domain/session/errors/journal-corrupted.error";
import { SessionAlreadyExistsError } from "../../domain/session/errors/session-already-exists.error";
import { SessionNotFoundError } from "../../domain/session/errors/session-not-found.error";
import { SessionRevisionConflictError } from "../../domain/session/errors/session-revision-conflict.error";
import type { Session } from "../../domain/session/session";
import type { SessionSnapshot } from "../../domain/session/session-snapshot";
import { SessionRecord } from "./session-record";

/**
 * Reference storage, and the shape every durable adapter is measured against.
 *
 * Appends to one session are serialized through a per session critical section, so a
 * race resolves by `expectedRevision` instead of by whichever caller happened to run
 * first. Different sessions never wait on each other.
 */
export class InMemorySessionStorage extends SessionStorage {
	private readonly records = new Map<string, SessionRecord>();
	private readonly locks = new Map<string, Promise<void>>();

	public constructor(private readonly registry: SessionEventRegistry = SessionEventCodecs.registry()) {
		super();
	}

	public capabilities(): StorageCapabilities {
		return StorageCapabilities.durable({ snapshots: true });
	}

	public async create(session: Session): Promise<void> {
		if (this.records.has(session.id.value)) throw new SessionAlreadyExistsError(session.id.value);
		this.records.set(session.id.value, new SessionRecord(session));
	}

	public async find(sessionId: SessionId): Promise<Session | undefined> {
		return this.records.get(sessionId.value)?.session;
	}

	public async findOrFail(sessionId: SessionId): Promise<Session> {
		const session = await this.find(sessionId);
		if (session === undefined) throw new SessionNotFoundError(sessionId.value);
		return session;
	}

	public async append(command: AppendEventsCommand): Promise<AppendEventsResult> {
		return this.withinSession(command.sessionId, () => this.appendLocked(command));
	}

	public async *readEvents(sessionId: SessionId, afterRevision: SessionRevision): AsyncIterable<StoredSessionEvent> {
		const record = this.records.get(sessionId.value);
		if (record === undefined) throw new SessionNotFoundError(sessionId.value);
		for (const stored of record.events) {
			if (stored.revision.isAfter(afterRevision)) yield stored;
		}
	}

	public async delete(sessionId: SessionId): Promise<void> {
		this.records.delete(sessionId.value);
	}

	public async saveSnapshot(snapshot: SessionSnapshot): Promise<void> {
		const record = this.records.get(snapshot.sessionId.value);
		if (record === undefined) throw new SessionNotFoundError(snapshot.sessionId.value);
		record.snapshot = snapshot;
	}

	public async findSnapshot(sessionId: SessionId): Promise<SessionSnapshot | undefined> {
		return this.records.get(sessionId.value)?.snapshot;
	}

	public async saveCheckpoint(checkpoint: ContextCheckpoint): Promise<void> {
		const record = this.records.get(checkpoint.sessionId.value);
		if (record === undefined) throw new SessionNotFoundError(checkpoint.sessionId.value);
		record.checkpoints.set(checkpoint.key, checkpoint);
	}

	public async findCheckpoint(sessionId: SessionId): Promise<ContextCheckpoint | undefined> {
		const record = this.records.get(sessionId.value);
		if (record === undefined) return undefined;
		let furthest: ContextCheckpoint | undefined;
		for (const checkpoint of record.checkpoints.values()) {
			if (furthest === undefined || checkpoint.coveredRevision.isAfter(furthest.coveredRevision)) {
				furthest = checkpoint;
			}
		}
		return furthest;
	}

	private appendLocked(command: AppendEventsCommand): AppendEventsResult {
		const record = this.records.get(command.sessionId.value);
		if (record === undefined) throw new SessionNotFoundError(command.sessionId.value);

		const head = record.session.revision;
		const replayed = this.replayOf(record, command);
		if (replayed !== undefined) return replayed;

		if (!head.equals(command.expectedRevision)) {
			throw new SessionRevisionConflictError(command.sessionId.value, command.expectedRevision.value, head.value);
		}

		const committed: StoredSessionEvent[] = [];
		let revision = head;
		for (const event of command.batch.events) {
			revision = revision.next();
			committed.push(new StoredSessionEvent(command.sessionId, revision, event));
		}
		record.events.push(...committed);
		record.session = record.session.at(revision);
		return new AppendEventsResult(committed, revision);
	}

	/**
	 * A retry of a batch that already landed answers with what was written before.
	 * Idempotency is keyed by event id; the same id carrying different content is not a
	 * retry, it is corruption, and it stops the write.
	 */
	private replayOf(record: SessionRecord, command: AppendEventsCommand): AppendEventsResult | undefined {
		const known = new Map(record.events.map((stored) => [stored.event.id.value, stored]));
		const matches: StoredSessionEvent[] = [];
		for (const event of command.batch.events) {
			const stored = known.get(event.id.value);
			if (stored === undefined) return undefined;
			if (this.fingerprintOf(stored.event) !== this.fingerprintOf(event)) {
				throw new JournalCorruptedError(
					command.sessionId.value,
					`event ${event.id.value} was already written with different content.`,
				);
			}
			matches.push(stored);
		}
		return matches.length === 0 ? undefined : new AppendEventsResult(matches, record.session.revision);
	}

	/**
	 * What an event would be written as, which is the only definition of "the same event"
	 * a durable adapter could ever check. Object identity would make every retry that
	 * crossed a process boundary look like corruption.
	 */
	private fingerprintOf(event: SessionEvent): string {
		return `${event.type}:${JSON.stringify(this.registry.codecFor(event.type).encode(event))}`;
	}

	/** Serializes work on one session while leaving every other session free. */
	private async withinSession<T>(sessionId: SessionId, work: () => T): Promise<T> {
		const previous = this.locks.get(sessionId.value) ?? Promise.resolve();
		let release = (): void => undefined;
		this.locks.set(
			sessionId.value,
			new Promise<void>((resolve) => {
				release = resolve;
			}),
		);
		await previous;
		try {
			return work();
		} finally {
			release();
		}
	}
}
