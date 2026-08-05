import type { AgentRunId } from "../../../common/identity/agent-run-id";
import type { CorrelationId } from "../../../common/identity/correlation-id";
import type { AgentName } from "../../agent/agent-name";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** An agent handed work to a child run, opening a delegation that a completion event closes. */
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
