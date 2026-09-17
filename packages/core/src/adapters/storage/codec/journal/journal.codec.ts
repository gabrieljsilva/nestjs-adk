import { AgentId } from "../../../../common/identity/agent-id.value-object";
import { AgentRunId } from "../../../../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../../../../common/identity/correlation-id.value-object";
import { EventId } from "../../../../common/identity/event-id.value-object";
import { Instant } from "../../../../common/time/instant.value-object";
import { EventCorrelation } from "../../../../domain/event/event-correlation.value-object";
import { EventHeader } from "../../../../domain/event/event-header.value-object";
import { SessionEventCodecs } from "../../../../domain/event/session-event-codecs.factory";
import type { SessionEventRegistry } from "../../../../domain/event/session-event-registry.service";
import type { SessionEvent } from "../../../../domain/event/session-event.event";
import { JournalRecord } from "./journal.record";

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
			this.registry.findCodecOrFail(event.type).encode(event),
		);
	}

	public decode(values: unknown): SessionEvent {
		const record = JournalRecord.from(values);
		return this.registry.decode(record.type, record.schemaVersion, record.payload, this.buildHeader(record));
	}

	public calculateFingerprint(event: SessionEvent): string {
		return `${event.type}:${JSON.stringify(this.registry.findCodecOrFail(event.type).encode(event))}`;
	}

	private buildHeader(record: JournalRecord): EventHeader {
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
