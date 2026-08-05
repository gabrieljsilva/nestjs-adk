import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** An agent run was stopped from the outside before it could finish. */
export class AgentRunCancelled extends SessionEvent {
	public readonly type = AgentRunCancelled.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "run.cancelled";

	public constructor(
		header: EventHeader,
		public readonly reason: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
