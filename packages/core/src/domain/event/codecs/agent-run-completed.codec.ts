import { AgentRunCompleted } from "../catalog/agent-run-completed";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the successful end of an agent run. */
export class AgentRunCompletedCodec extends SessionEventCodec<AgentRunCompleted> {
	public readonly type = AgentRunCompleted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: AgentRunCompleted): Record<string, unknown> {
		return { finishReason: event.finishReason };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): AgentRunCompleted {
		return new AgentRunCompleted(header, this.readText(payload, "finishReason"));
	}
}
