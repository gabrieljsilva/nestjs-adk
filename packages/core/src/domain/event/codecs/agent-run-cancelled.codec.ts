import { AgentRunCancelled } from "../catalog/agent-run-cancelled";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the cancellation of an agent run. */
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
