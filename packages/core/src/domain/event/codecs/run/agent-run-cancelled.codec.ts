import { AgentRunCancelled } from "../../catalog/run/agent-run-cancelled.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

export class AgentRunCancelledCodec extends SessionEventCodec<AgentRunCancelled> {
	public readonly type = AgentRunCancelled.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: AgentRunCancelled): Record<string, unknown> {
		return { reason: event.reason };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): AgentRunCancelled {
		return new AgentRunCancelled(header, this.readText(payload, "reason"));
	}
}
