import { AgentName } from "../../../agent/agent-name.value-object";
import { ModelIdentity } from "../../../model/descriptor/model-identity.value-object";
import { AgentRunStarted } from "../../catalog/run/agent-run-started.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

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
			new ModelIdentity(this.readText(payload, "provider"), this.readText(payload, "model")),
		);
	}
}
