import type { AgentName } from "../../../agent/agent-name.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

export class AgentTransferred extends SessionEvent {
	public readonly type = AgentTransferred.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "agent.transferred";

	public constructor(
		header: EventHeader,
		public readonly from: AgentName,
		public readonly to: AgentName,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
