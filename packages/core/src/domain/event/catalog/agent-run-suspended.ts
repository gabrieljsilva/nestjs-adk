import type { PendingCall } from "../../session/pending-call";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** The version that started carrying the whole turn rather than one call of it. */
const SCHEMA_VERSION = 2;

/**
 * The run stopped and is waiting for something outside it.
 *
 * A suspended run is not a live thing: nothing is retained, no timer holds it and a
 * shutdown does not wait on it. What continues the conversation later is a new run that
 * points back at this one, which is why this event ends a run rather than pausing it.
 *
 * The whole turn travels with it, calls that were held and calls that were not. That is
 * what makes the suspension self contained: whoever resumes reads one event and knows
 * everything that has to run, instead of reassembling a turn from the journal around it.
 */
export class AgentRunSuspended extends SessionEvent {
	public readonly type = AgentRunSuspended.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

	public static readonly TYPE = "run.suspended";

	public constructor(
		header: EventHeader,
		public readonly reason: string,
		public readonly calls: readonly PendingCall[] = [],
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
