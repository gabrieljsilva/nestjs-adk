import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

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
