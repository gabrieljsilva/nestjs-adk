import {
	type AppendEventsCommand,
	AppendEventsResult,
	type CheckpointRecord,
	type ContextCheckpoint,
	JournalCorruptedError,
	type JournalRecord,
	type Session,
	SessionAlreadyExistsError,
	type SessionHeadRecord,
	type SessionId,
	SessionNotFoundError,
	SessionRevision,
	SessionRevisionConflictError,
	type SessionSnapshot,
	SessionStorage,
	type SnapshotRecord,
	StorageCapabilities,
	StorageCodecs,
	StoredSessionEvent,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { SessionStorageContractSuite } from "./session-storage-contract-suite";

/** One journal row, which is a revision and the columns the codec wrote. */
class Row {
	public constructor(
		public readonly revision: number,
		public readonly record: JournalRecord,
	) {}
}

/**
 * A storage that only ever holds rows, which is the point.
 *
 * Everything it keeps is plain values, exactly what a database column can hold, and every
 * domain object it answers with is rebuilt by a codec. Nothing here imports anything the
 * core does not publish, so if this compiles and passes the contract, so does
 * a Prisma or a Postgres adapter written downstream.
 */
class RowStorage extends SessionStorage {
	private readonly codecs = StorageCodecs.standard();
	private readonly heads = new Map<string, SessionHeadRecord>();
	private readonly journals = new Map<string, Row[]>();
	private readonly snapshots = new Map<string, SnapshotRecord>();
	private readonly checkpoints = new Map<string, Map<string, CheckpointRecord>>();

	public capabilities(): StorageCapabilities {
		return StorageCapabilities.durable({ snapshots: true, checkpoints: true });
	}

	public async create(session: Session): Promise<void> {
		if (this.heads.has(session.id.value)) throw new SessionAlreadyExistsError(session.id.value);
		this.heads.set(session.id.value, this.codecs.head.encode(session));
		this.journals.set(session.id.value, []);
	}

	public async find(sessionId: SessionId): Promise<Session | undefined> {
		const head = this.heads.get(sessionId.value);
		return head === undefined ? undefined : this.codecs.head.decode(head);
	}

	public async findOrFail(sessionId: SessionId): Promise<Session> {
		const session = await this.find(sessionId);
		if (session === undefined) throw new SessionNotFoundError(sessionId.value);
		return session;
	}

	public async append(command: AppendEventsCommand): Promise<AppendEventsResult> {
		const head = this.headOrFail(command.sessionId);
		const rows = this.journals.get(command.sessionId.value) ?? [];

		const replayed = this.replayOf(command, rows);
		if (replayed !== undefined) return replayed;

		if (head.revision !== command.expectedRevision.value) {
			throw new SessionRevisionConflictError(command.sessionId.value, command.expectedRevision.value, head.revision);
		}

		const committed: StoredSessionEvent[] = [];
		for (const event of command.batch.events) {
			const revision = head.revision + committed.length + 1;
			rows.push(new Row(revision, this.codecs.journal.encode(event)));
			committed.push(new StoredSessionEvent(command.sessionId, SessionRevision.of(revision), event));
		}
		this.journals.set(command.sessionId.value, rows);
		const revision = head.revision + committed.length;
		this.heads.set(command.sessionId.value, { ...head, revision });
		return new AppendEventsResult(committed, SessionRevision.of(revision));
	}

	public async *readEvents(sessionId: SessionId, afterRevision: SessionRevision): AsyncIterable<StoredSessionEvent> {
		const rows = this.journals.get(sessionId.value);
		if (rows === undefined) throw new SessionNotFoundError(sessionId.value);
		for (const row of rows) {
			if (row.revision <= afterRevision.value) continue;
			yield this.storedOf(sessionId, row);
		}
	}

	public async delete(sessionId: SessionId): Promise<void> {
		this.heads.delete(sessionId.value);
		this.journals.delete(sessionId.value);
		this.snapshots.delete(sessionId.value);
		this.checkpoints.delete(sessionId.value);
	}

	public async saveSnapshot(snapshot: SessionSnapshot): Promise<void> {
		this.headOrFail(snapshot.sessionId);
		this.snapshots.set(snapshot.sessionId.value, this.codecs.snapshot.encode(snapshot));
	}

	public async findSnapshot(sessionId: SessionId): Promise<SessionSnapshot | undefined> {
		const record = this.snapshots.get(sessionId.value);
		return record === undefined ? undefined : this.codecs.snapshot.decode(record);
	}

	public async saveCheckpoint(checkpoint: ContextCheckpoint): Promise<void> {
		this.headOrFail(checkpoint.sessionId);
		const record = this.codecs.checkpoint.encode(checkpoint);
		const kept = this.checkpoints.get(checkpoint.sessionId.value) ?? new Map<string, CheckpointRecord>();
		kept.set(record.key, record);
		this.checkpoints.set(checkpoint.sessionId.value, kept);
	}

	public async findCheckpoint(sessionId: SessionId): Promise<ContextCheckpoint | undefined> {
		let furthest: CheckpointRecord | undefined;
		for (const record of this.checkpoints.get(sessionId.value)?.values() ?? []) {
			if (furthest === undefined || record.coveredRevision > furthest.coveredRevision) furthest = record;
		}
		return furthest === undefined ? undefined : this.codecs.checkpoint.decode(furthest);
	}

	private storedOf(sessionId: SessionId, row: Row): StoredSessionEvent {
		return new StoredSessionEvent(sessionId, SessionRevision.of(row.revision), this.codecs.journal.decode(row.record));
	}

	private headOrFail(sessionId: SessionId): SessionHeadRecord {
		const head = this.heads.get(sessionId.value);
		if (head === undefined) throw new SessionNotFoundError(sessionId.value);
		return head;
	}

	/**
	 * A retry answers with what was written before, and the same id carrying something
	 * else is a journal disagreeing with itself rather than a caller retrying.
	 */
	private replayOf(command: AppendEventsCommand, rows: readonly Row[]): AppendEventsResult | undefined {
		const written = new Map(rows.map((row) => [row.record.eventId, row]));
		const matches: StoredSessionEvent[] = [];
		for (const event of command.batch.events) {
			const row = written.get(event.id.value);
			if (row === undefined) return undefined;
			if (
				this.codecs.journal.fingerprintOf(event) !==
				this.codecs.journal.fingerprintOf(this.codecs.journal.decode(row.record))
			) {
				throw new JournalCorruptedError(
					command.sessionId.value,
					`event ${event.id.value} was already written with different content.`,
				);
			}
			matches.push(this.storedOf(command.sessionId, row));
		}
		if (matches.length === 0) return undefined;
		return new AppendEventsResult(matches, SessionRevision.of(this.headOrFail(command.sessionId).revision));
	}
}

/**
 * The same cases that measure the adapters the library ships, run against one written
 * outside it.
 *
 * This file is the proof that the port is implementable. It imports `@nestjs-adk/core`
 * the way an application does, holds nothing but rows, and rebuilds every domain object
 * through a codec. A symbol that stopped being exported breaks it here rather than at
 * somebody's install.
 */
describe("a storage written with only what the core publishes", () => {
	const suite = new SessionStorageContractSuite();

	for (const contract of suite.cases(() => new RowStorage())) {
		it(contract.name, async () => {
			await contract.run();
		});
	}

	it("is held to the durable cases, which is what it claims to be", () => {
		expect(suite.cases(() => new RowStorage()).length).toBeGreaterThan(0);
		expect(new RowStorage().capabilities().supportsDurableSessions).toBe(true);
	});
});
