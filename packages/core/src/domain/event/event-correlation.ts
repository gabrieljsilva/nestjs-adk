import type { AgentId } from "../../common/identity/agent-id";
import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { CorrelationId } from "../../common/identity/correlation-id";
import type { EventId } from "../../common/identity/event-id";

/**
 * Who produced an event and what caused it.
 * Causation points at the event that led to this one, which is what lets a reader
 * rebuild a tool call and its result, or a delegation and the run it started.
 */
export class EventCorrelation {
	public constructor(
		public readonly runId: AgentRunId,
		public readonly agentId: AgentId,
		public readonly correlationId: CorrelationId,
		public readonly causationId?: EventId,
	) {}
}
