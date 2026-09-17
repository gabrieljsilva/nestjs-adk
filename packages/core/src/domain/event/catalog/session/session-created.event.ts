import type { AgentName } from "../../../agent/agent-name.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

const SCHEMA_VERSION = 2;

export class SessionCreated extends SessionEvent {
	public readonly type = SessionCreated.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public static readonly TYPE = "session.created";

	public constructor(
		header: EventHeader,
		public readonly rootAgent: AgentName,
		public readonly actorId: string | undefined,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
