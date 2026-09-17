import { AgentRunCompleted } from "../../catalog/run/agent-run-completed.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

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
