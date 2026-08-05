import { AgentId } from "../../../common/identity/agent-id";
import { AgentRunId } from "../../../common/identity/agent-run-id";
import { CorrelationId } from "../../../common/identity/correlation-id";
import { EventId } from "../../../common/identity/event-id";
import type { SessionId } from "../../../common/identity/session-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { Instant } from "../../../common/time/instant";
import { EventCorrelation } from "../../../domain/event/event-correlation";
import { EventHeader } from "../../../domain/event/event-header";
import type { SessionEvent } from "../../../domain/event/session-event";
import type { SessionEventRegistry } from "../../../domain/event/session-event-registry";
import { StoredSessionEvent } from "../../../domain/event/stored-session-event";
import type { SqliteConnection } from "./sqlite-connection";
import { SqliteRow } from "./sqlite-row";

/**
 * The journal itself: append only rows, read back in the order they were written.
 *
 * Events are stored encoded rather than as objects, and decoded through the same registry
 * the rest of the runtime uses. That is what makes a row written by an older build
 * readable: the codec and its upcasters own the shape, not this table.
 */
export class EventRepository {
	public constructor(
		private readonly connection: SqliteConnection,
		private readonly registry: SessionEventRegistry,
	) {}

	public append(sessionId: SessionId, revision: SessionRevision, event: SessionEvent): void {
		const codec = this.registry.codecFor(event.type);
		this.connection.run(
			"INSERT INTO session_events (session_id, revision, event_id, type, schema_version, occurred_at, run_id, agent_id, correlation_id, causation_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			sessionId.value,
			revision.value,
			event.id.value,
			event.type,
			event.schemaVersion.value,
			event.occurredAt.toIso(),
			event.correlation.runId.value,
			event.correlation.agentId.value,
			event.correlation.correlationId.value,
			event.correlation.causationId?.value ?? null,
			JSON.stringify(codec.encode(event)),
		);
	}

	public after(sessionId: SessionId, revision: SessionRevision): readonly StoredSessionEvent[] {
		return this.connection
			.all(
				"SELECT * FROM session_events WHERE session_id = ? AND revision > ? ORDER BY revision ASC",
				sessionId.value,
				revision.value,
			)
			.map((row) => this.toStored(sessionId, new SqliteRow(row)));
	}

	/** What is already written under these event ids, which is how a retry recognizes itself. */
	public byIds(sessionId: SessionId, ids: readonly string[]): readonly StoredSessionEvent[] {
		if (ids.length === 0) return [];
		const placeholders = ids.map(() => "?").join(", ");
		return this.connection
			.all(
				`SELECT * FROM session_events WHERE session_id = ? AND event_id IN (${placeholders}) ORDER BY revision ASC`,
				sessionId.value,
				...ids,
			)
			.map((row) => this.toStored(sessionId, new SqliteRow(row)));
	}

	/**
	 * What each of these event ids was written as, verbatim.
	 * Recognizing a retry means comparing content and not only ids: the same id carrying
	 * something else is a journal disagreeing with itself, not a caller retrying.
	 */
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
			const row = new SqliteRow(found);
			written.set(row.text("event_id"), `${row.text("type")}:${row.text("payload")}`);
		}
		return written;
	}

	/** The same fingerprint, taken from an event that has not been written yet. */
	public fingerprintOf(event: SessionEvent): string {
		return `${event.type}:${JSON.stringify(this.registry.codecFor(event.type).encode(event))}`;
	}

	public deleteAll(sessionId: SessionId): void {
		this.connection.run("DELETE FROM session_events WHERE session_id = ?", sessionId.value);
	}

	private toStored(sessionId: SessionId, row: SqliteRow): StoredSessionEvent {
		const causation = row.optionalText("causation_id");
		const header = new EventHeader(
			EventId.from(row.text("event_id")),
			Instant.fromIso(row.text("occurred_at")),
			new EventCorrelation(
				AgentRunId.from(row.text("run_id")),
				AgentId.from(row.text("agent_id")),
				CorrelationId.from(row.text("correlation_id")),
				causation === undefined ? undefined : EventId.from(causation),
			),
		);
		const event = this.registry.decode(row.text("type"), row.integer("schema_version"), row.json("payload"), header);
		return new StoredSessionEvent(sessionId, SessionRevision.of(row.integer("revision")), event);
	}
}
