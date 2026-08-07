import { AgentId } from "../../../common/identity/agent-id";
import { AgentRunId } from "../../../common/identity/agent-run-id";
import { CorrelationId } from "../../../common/identity/correlation-id";
import { EventId } from "../../../common/identity/event-id";
import { Instant } from "../../../common/time/instant";
import { EventCorrelation } from "../../../domain/event/event-correlation";
import { EventHeader } from "../../../domain/event/event-header";
import type { SessionEvent } from "../../../domain/event/session-event";
import { SessionEventCodecs } from "../../../domain/event/session-event-codecs";
import type { SessionEventRegistry } from "../../../domain/event/session-event-registry";
import { JournalRecord } from "./journal-record";

/**
 * Turns an event into a journal row and back.
 *
 * This is the whole reason a session storage can live outside this package. The registry
 * below encodes payloads, and a payload is not a row: writing one still means reading the
 * header off the event, and reading one back means rebuilding that header before any codec
 * can be asked for the event class. Doing that by hand needs the concrete event classes and
 * six identity types, so an adapter written that way could only ever be written in here.
 *
 * What comes back is the class the projectors decide on, which is the part that cannot be
 * approximated: a plain object with the right fields passes every `instanceof` in the
 * runtime without entering one, and the session rehydrates into silence rather than an
 * error. A payload older than this build walks the upcaster chain on the way through, so a
 * journal written months ago stays readable; one written by a newer build stops the read
 * instead of dropping the meaning it carries.
 */
export class JournalCodec {
	public constructor(private readonly registry: SessionEventRegistry = SessionEventCodecs.registry()) {}

	public encode(event: SessionEvent): JournalRecord {
		return new JournalRecord(
			event.id.value,
			event.type,
			event.schemaVersion.value,
			event.occurredAt.toIso(),
			event.correlation.runId.value,
			event.correlation.agentId.value,
			event.correlation.correlationId.value,
			event.correlation.causationId?.value,
			this.registry.codecFor(event.type).encode(event),
		);
	}

	/** Takes the record this codec wrote, or the row a driver handed the adapter back. */
	public decode(values: unknown): SessionEvent {
		const record = JournalRecord.from(values);
		return this.registry.decode(record.type, record.schemaVersion, record.payload, this.headerOf(record));
	}

	/**
	 * What an event would be written as, which is the only definition of "the same event"
	 * a durable adapter can check.
	 *
	 * An idempotent append has to tell a retry from an id that came back carrying something
	 * else, and object identity cannot: a retry that crossed a process boundary is a
	 * different instance of the same fact. An adapter fingerprinting its own way would
	 * disagree with the ones this library ships about which writes are duplicates.
	 */
	public fingerprintOf(event: SessionEvent): string {
		return `${event.type}:${JSON.stringify(this.registry.codecFor(event.type).encode(event))}`;
	}

	private headerOf(record: JournalRecord): EventHeader {
		return new EventHeader(
			EventId.from(record.eventId),
			Instant.fromIso(record.occurredAt),
			new EventCorrelation(
				AgentRunId.from(record.runId),
				AgentId.from(record.agentId),
				CorrelationId.from(record.correlationId),
				record.causationId === undefined ? undefined : EventId.from(record.causationId),
			),
		);
	}
}
