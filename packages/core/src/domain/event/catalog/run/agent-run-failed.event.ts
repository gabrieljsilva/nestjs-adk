import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

export class AgentRunFailed extends SessionEvent {
	public readonly type = AgentRunFailed.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "run.failed";

	public constructor(
		header: EventHeader,
		public readonly errorCode: string,
		public readonly reason: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
