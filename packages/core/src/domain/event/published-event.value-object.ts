import type { SessionId } from "../../common/identity/session-id.value-object";
import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { Instant } from "../../common/time/instant.value-object";
import type { EventCorrelation } from "./event-correlation.value-object";
import type { SessionEvent } from "./session-event.event";
import type { StoredSessionEvent } from "./stored-session-event.record";

/**
 * What an observer sees: a type, a correlation and an already redacted payload, never
 * the event instance itself.
 *
 * A durable event carries the revision it landed on and can be replayed from the
 * journal; a runtime one never reached storage and has none.
 */
export class PublishedEvent {
	private constructor(
		public readonly sessionId: SessionId,
		public readonly type: string,
		public readonly schemaVersion: number,
		public readonly occurredAt: Instant,
		public readonly correlation: EventCorrelation,
		public readonly payload: Readonly<Record<string, unknown>>,
		public readonly revision?: SessionRevision,
	) {}

	public static durable(stored: StoredSessionEvent, payload: Readonly<Record<string, unknown>>): PublishedEvent {
		const event = stored.event;
		return new PublishedEvent(
			stored.sessionId,
			event.type,
			event.schemaVersion.value,
			event.occurredAt,
			event.correlation,
			payload,
			stored.revision,
		);
	}

	public static runtime(
		sessionId: SessionId,
		event: SessionEvent,
		payload: Readonly<Record<string, unknown>>,
	): PublishedEvent {
		return new PublishedEvent(
			sessionId,
			event.type,
			event.schemaVersion.value,
			event.occurredAt,
			event.correlation,
			payload,
		);
	}

	public get isDurable(): boolean {
		return this.revision !== undefined;
	}
}
