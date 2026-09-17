import type { SessionId } from "../../common/identity/session-id.value-object";
import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import { AppendEventsResult } from "../../contracts/storage/append-events-result.value-object";
import type { AppendEventsCommand } from "../../contracts/storage/append-events.command";
import { SessionStorage } from "../../contracts/storage/session-storage.contract";
import { StorageCapabilities } from "../../contracts/storage/storage-capabilities.value-object";
import type { ContextCheckpoint } from "../../domain/context/context-checkpoint.value-object";
import { SessionEventCodecs } from "../../domain/event/session-event-codecs.factory";
import type { SessionEventRegistry } from "../../domain/event/session-event-registry.service";
import type { SessionEvent } from "../../domain/event/session-event.event";
import { StoredSessionEvent } from "../../domain/event/stored-session-event.record";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { JournalCorruptedError } from "../../domain/session/errors/journal-corrupted.error";
import { SessionAlreadyExistsError } from "../../domain/session/errors/session-already-exists.error";
import { SessionNotFoundError } from "../../domain/session/errors/session-not-found.error";
import { SessionRevisionConflictError } from "../../domain/session/errors/session-revision-conflict.error";
import type { Session } from "../../domain/session/session.entity";
import type { SessionSnapshot } from "../../domain/session/state/session-snapshot.value-object";
import { SessionRecord } from "./session.record";

/**
 * Sessions kept in this process, which is the default storage and what every durable adapter is
 * measured against. Nothing survives a restart.
 *
 * Appends to one session are serialized, so a race resolves by `expectedRevision` rather than by
 * whichever caller ran first; different sessions never wait on each other.
 */
export class InMemorySessionStorage extends SessionStorage {
	private readonly records = new Map<string, SessionRecord>();
	private readonly locks = new Map<string, Promise<void>>();

	public constructor(private readonly registry: SessionEventRegistry = SessionEventCodecs.registry()) {
		super();
	}

	public capabilities(): StorageCapabilities {
		return StorageCapabilities.concurrent({ snapshots: true });
	}

	public async create(_context: SessionContext, session: Session): Promise<void> {
		if (this.records.has(session.id.value)) throw new SessionAlreadyExistsError(session.id.value);
		this.records.set(session.id.value, new SessionRecord(session));
	}

	public async find(context: SessionContext): Promise<Session | undefined> {
		return this.records.get(context.sessionId.value)?.session;
	}

	public async append(_context: SessionContext, command: AppendEventsCommand): Promise<AppendEventsResult> {
		return this.withinSession(command.sessionId, () => this.appendLocked(command));
	}

	public async *readEvents(context: SessionContext, afterRevision: SessionRevision): AsyncIterable<StoredSessionEvent> {
		const sessionId = context.sessionId;
		const record = this.records.get(sessionId.value);
		if (record === undefined) throw new SessionNotFoundError(sessionId.value);
		for (const stored of record.events) {
			if (stored.revision.isAfter(afterRevision)) yield stored;
		}
	}

	public async delete(context: SessionContext): Promise<void> {
		this.records.delete(context.sessionId.value);
	}

	public async saveSnapshot(_context: SessionContext, snapshot: SessionSnapshot): Promise<void> {
		const record = this.records.get(snapshot.sessionId.value);
		if (record === undefined) throw new SessionNotFoundError(snapshot.sessionId.value);
		record.snapshot = snapshot;
	}

	public async findSnapshot(context: SessionContext): Promise<SessionSnapshot | undefined> {
		return this.records.get(context.sessionId.value)?.snapshot;
	}

	public async saveCheckpoint(_context: SessionContext, checkpoint: ContextCheckpoint): Promise<void> {
		const record = this.records.get(checkpoint.sessionId.value);
		if (record === undefined) throw new SessionNotFoundError(checkpoint.sessionId.value);
		record.checkpoints.set(checkpoint.key, checkpoint);
	}

	public async findCheckpoint(context: SessionContext): Promise<ContextCheckpoint | undefined> {
		const record = this.records.get(context.sessionId.value);
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
		const replayed = this.findReplay(record, command);
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

	private findReplay(record: SessionRecord, command: AppendEventsCommand): AppendEventsResult | undefined {
		const known = new Map(record.events.map((stored) => [stored.event.id.value, stored]));
		const matches: StoredSessionEvent[] = [];
		for (const event of command.batch.events) {
			const stored = known.get(event.id.value);
			if (stored === undefined) return undefined;
			if (this.calculateFingerprint(stored.event) !== this.calculateFingerprint(event)) {
				throw new JournalCorruptedError(
					command.sessionId.value,
					`event ${event.id.value} was already written with different content.`,
				);
			}
			matches.push(stored);
		}
		return matches.length === 0 ? undefined : new AppendEventsResult(matches, record.session.revision);
	}

	private calculateFingerprint(event: SessionEvent): string {
		return `${event.type}:${JSON.stringify(this.registry.findCodecOrFail(event.type).encode(event))}`;
	}

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
