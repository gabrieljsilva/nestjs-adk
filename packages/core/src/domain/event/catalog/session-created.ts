import type { AgentName } from "../../agent/agent-name";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** The first fact of every journal: a session exists, rooted at one agent. */
export class SessionCreated extends SessionEvent {
	public readonly type = SessionCreated.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "session.created";

	public constructor(
		header: EventHeader,
		public readonly rootAgent: AgentName,
		public readonly owner: string | undefined,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
