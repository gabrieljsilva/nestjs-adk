import { AgentName } from "../../agent/agent-name";
import { AgentTransferred } from "../catalog/agent-transferred";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the handover of the session from one agent to another. */
export class AgentTransferredCodec extends SessionEventCodec<AgentTransferred> {
	public readonly type = AgentTransferred.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: AgentTransferred): Record<string, unknown> {
		return { from: event.from.value, to: event.to.value };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): AgentTransferred {
		return new AgentTransferred(
			header,
			AgentName.from(this.readText(payload, "from")),
			AgentName.from(this.readText(payload, "to")),
		);
	}
}
