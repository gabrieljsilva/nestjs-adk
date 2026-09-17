import type { AgentId } from "../../common/identity/agent-id.value-object";
import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { CorrelationId } from "../../common/identity/correlation-id.value-object";
import type { EventId } from "../../common/identity/event-id.value-object";

export class EventCorrelation {
	public constructor(
		public readonly runId: AgentRunId,
		public readonly agentId: AgentId,
		public readonly correlationId: CorrelationId,
		public readonly causationId?: EventId,
	) {}
}
