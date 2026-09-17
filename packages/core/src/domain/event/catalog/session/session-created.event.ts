import type { AgentName } from "../../../agent/agent-name.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

/** The version that records the actor who opened the conversation instead of an owner. */
const SCHEMA_VERSION = 2;

/**
 * The first fact of every journal: a session exists, rooted at one agent.
 *
 * The actor is the id of whoever the run was asked with, and only the id: an actor's claims
 * are the application's vocabulary, they are read by a policy at the moment of the call, and
 * a copy of them frozen in a journal would be an authorization decision nobody revisits.
 */
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
