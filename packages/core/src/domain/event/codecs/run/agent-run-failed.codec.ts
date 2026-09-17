import { AgentRunFailed } from "../../catalog/run/agent-run-failed.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

/** Codec for the failed end of an agent run. */
export class AgentRunFailedCodec extends SessionEventCodec<AgentRunFailed> {
	public readonly type = AgentRunFailed.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: AgentRunFailed): Record<string, unknown> {
		return { errorCode: event.errorCode, reason: event.reason };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): AgentRunFailed {
		return new AgentRunFailed(header, this.readText(payload, "errorCode"), this.readText(payload, "reason"));
	}
}
