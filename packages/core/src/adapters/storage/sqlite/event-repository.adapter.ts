import type { SessionId } from "../../../common/identity/session-id.value-object";
import { SessionRevision } from "../../../common/revision/session-revision.value-object";
import type { SessionEvent } from "../../../domain/event/session-event.event";
import { StoredSessionEvent } from "../../../domain/event/stored-session-event.record";
import type { JournalCodec } from "../codec/journal/journal.codec";
import { StoredRow } from "../codec/stored-row.record";
import type { SqliteConnection } from "./sqlite-connection.adapter";

export class EventRepository {
	public constructor(
		private readonly connection: SqliteConnection,
		private readonly codec: JournalCodec,
	) {}

	public append(sessionId: SessionId, revision: SessionRevision, event: SessionEvent): void {
		const record = this.codec.encode(event);
		this.connection.run(
			"INSERT INTO session_events (session_id, revision, event_id, type, schema_version, occurred_at, run_id, agent_id, correlation_id, causation_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			sessionId.value,
			revision.value,
			record.eventId,
			record.type,
			record.schemaVersion,
			record.occurredAt,
			record.runId,
			record.agentId,
			record.correlationId,
			record.causationId ?? null,
			JSON.stringify(record.payload),
		);
	}

	public after(sessionId: SessionId, revision: SessionRevision): readonly StoredSessionEvent[] {
		return this.connection
			.all(
				"SELECT * FROM session_events WHERE session_id = ? AND revision > ? ORDER BY revision ASC",
				sessionId.value,
				revision.value,
			)
			.map((row) => this.toStored(sessionId, new StoredRow(row)));
	}

	public byIds(sessionId: SessionId, ids: readonly string[]): readonly StoredSessionEvent[] {
		if (ids.length === 0) return [];
		const placeholders = ids.map(() => "?").join(", ");
		return this.connection
			.all(
				`SELECT * FROM session_events WHERE session_id = ? AND event_id IN (${placeholders}) ORDER BY revision ASC`,
				sessionId.value,
				...ids,
			)
			.map((row) => this.toStored(sessionId, new StoredRow(row)));
	}

	public writtenPayloads(sessionId: SessionId, ids: readonly string[]): ReadonlyMap<string, string> {
		if (ids.length === 0) return new Map();
		const placeholders = ids.map(() => "?").join(", ");
		const rows = this.connection.all(
			`SELECT event_id, type, payload FROM session_events WHERE session_id = ? AND event_id IN (${placeholders})`,
			sessionId.value,
			...ids,
		);
		const written = new Map<string, string>();
		for (const found of rows) {
			const row = new StoredRow(found);
			written.set(row.text("event_id"), `${row.text("type")}:${row.text("payload")}`);
		}
		return written;
	}

	public calculateFingerprint(event: SessionEvent): string {
		return this.codec.calculateFingerprint(event);
	}

	public deleteAll(sessionId: SessionId): void {
		this.connection.run("DELETE FROM session_events WHERE session_id = ?", sessionId.value);
	}

	private toStored(sessionId: SessionId, row: StoredRow): StoredSessionEvent {
		const event = this.codec.decode({
			eventId: row.text("event_id"),
			type: row.text("type"),
			schemaVersion: row.integer("schema_version"),
			occurredAt: row.text("occurred_at"),
			runId: row.text("run_id"),
			agentId: row.text("agent_id"),
			correlationId: row.text("correlation_id"),
			causationId: row.optionalText("causation_id"),
			payload: row.json("payload"),
		});
		return new StoredSessionEvent(sessionId, new SessionRevision(row.integer("revision")), event);
	}
}
