import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** An agent run ended on its own terms, with the reason the loop stopped. */
export class AgentRunCompleted extends SessionEvent {
	public readonly type = AgentRunCompleted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "run.completed";

	public constructor(
		header: EventHeader,
		public readonly finishReason: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
