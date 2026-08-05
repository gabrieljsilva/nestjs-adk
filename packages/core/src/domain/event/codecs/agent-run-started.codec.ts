import { AgentName } from "../../agent/agent-name";
import { ModelIdentity } from "../../model/model-identity";
import { AgentRunStarted } from "../catalog/agent-run-started";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the start of an agent run. */
export class AgentRunStartedCodec extends SessionEventCodec<AgentRunStarted> {
	public readonly type = AgentRunStarted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: AgentRunStarted): Record<string, unknown> {
		return { agent: event.agent.value, provider: event.model.provider, model: event.model.model };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): AgentRunStarted {
		return new AgentRunStarted(
			header,
			AgentName.from(this.readText(payload, "agent")),
			ModelIdentity.of(this.readText(payload, "provider"), this.readText(payload, "model")),
		);
	}
}
