import type { SessionId } from "../../common/identity/session-id";
import type { SessionRevision } from "../../common/revision/session-revision";
import type { Instant } from "../../common/time/instant";
import type { EventCorrelation } from "./event-correlation";
import type { SessionEvent } from "./session-event";
import type { StoredSessionEvent } from "./stored-session-event";

/**
 * What an observer sees, which is never the domain instance itself.
 *
 * Consumers get a type, a correlation and a payload that has already been through
 * redaction. Handing them the event object would hand them the whole domain, and would
 * put every field a future event gains on an external contract by accident.
 *
 * Durable and runtime events travel the same way and differ in one honest fact: a
 * durable event advanced a revision and can be replayed from the journal, a runtime one
 * never happened as far as storage is concerned.
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

	/** True when the journal holds this event, which is also when a replay will produce it again. */
	public get isDurable(): boolean {
		return this.revision !== undefined;
	}
}
