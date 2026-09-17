import type { AgentRunId } from "../../../../common/identity/agent-run-id.value-object";
import type { CorrelationId } from "../../../../common/identity/correlation-id.value-object";
import type { AgentName } from "../../../agent/agent-name.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

export class DelegationStarted extends SessionEvent {
	public readonly type = DelegationStarted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "delegation.started";

	public constructor(
		header: EventHeader,
		public readonly delegationId: CorrelationId,
		public readonly childRunId: AgentRunId,
		public readonly toAgent: AgentName,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
