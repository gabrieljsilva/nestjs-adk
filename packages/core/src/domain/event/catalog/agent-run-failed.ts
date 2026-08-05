import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** An agent run ended in an error, kept with the code and the reason it failed. */
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
