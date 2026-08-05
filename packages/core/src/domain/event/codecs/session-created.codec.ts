import { AgentName } from "../../agent/agent-name";
import { SessionCreated } from "../catalog/session-created";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Reference codec, and the shape every other one in this catalog follows. */
export class SessionCreatedCodec extends SessionEventCodec<SessionCreated> {
	public readonly type = SessionCreated.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: SessionCreated): Record<string, unknown> {
		return { rootAgent: event.rootAgent.value, owner: event.owner ?? null };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): SessionCreated {
		return new SessionCreated(
			header,
			AgentName.from(this.readText(payload, "rootAgent")),
			this.readOptionalText(payload, "owner"),
		);
	}
}
