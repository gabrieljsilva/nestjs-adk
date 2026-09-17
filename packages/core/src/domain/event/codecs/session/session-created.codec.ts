import { AgentName } from "../../../agent/agent-name.value-object";
import { SessionCreated } from "../../catalog/session/session-created.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

/** Matches the event: version 2 is the one that names the actor rather than an owner. */
const SCHEMA_VERSION = 2;

/** Reference codec, and the shape every other one in this catalog follows. */
export class SessionCreatedCodec extends SessionEventCodec<SessionCreated> {
	public readonly type = SessionCreated.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public encode(event: SessionCreated): Record<string, unknown> {
		return { rootAgent: event.rootAgent.value, actorId: event.actorId ?? null };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): SessionCreated {
		return new SessionCreated(
			header,
			AgentName.from(this.readText(payload, "rootAgent")),
			// Absent in version 1, which recorded the owner of the conversation instead.
			this.readOptionalText(payload, "actorId"),
		);
	}
}
