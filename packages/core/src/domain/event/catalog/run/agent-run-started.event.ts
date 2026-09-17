import type { AgentName } from "../../../agent/agent-name.value-object";
import type { ModelIdentity } from "../../../model/descriptor/model-identity.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

/** An agent run began, on one agent and one model. */
export class AgentRunStarted extends SessionEvent {
	public readonly type = AgentRunStarted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "run.started";

	public constructor(
		header: EventHeader,
		public readonly agent: AgentName,
		public readonly model: ModelIdentity,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
