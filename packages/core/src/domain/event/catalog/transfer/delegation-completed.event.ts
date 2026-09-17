import type { AgentRunId } from "../../../../common/identity/agent-run-id.value-object";
import type { CorrelationId } from "../../../../common/identity/correlation-id.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

/** A delegated child run reached its end, closing the delegation with the outcome it produced. */
export class DelegationCompleted extends SessionEvent {
	public readonly type = DelegationCompleted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "delegation.completed";

	public constructor(
		header: EventHeader,
		public readonly delegationId: CorrelationId,
		public readonly childRunId: AgentRunId,
		public readonly outcome: string,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
