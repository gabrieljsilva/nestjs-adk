import { AgentId } from "../../common/identity/agent-id";
import { EventId } from "../../common/identity/event-id";
import type { IdGenerator } from "../../common/identity/id-generator";
import type { Clock } from "../../common/time/clock";
import { EventCorrelation } from "../../domain/event/event-correlation";
import { EventHeader } from "../../domain/event/event-header";
import type { AgentRun } from "../../domain/session/agent-run";

/**
 * Builds the header every event of a run carries.
 *
 * Identity and time are the two things a run must never invent for itself: an event
 * stamped from the system clock is not reproducible, and an id the run made up is not
 * idempotent. Both arrive as dependencies, and the correlation is the run itself.
 */
export class RunEventFactory {
	public constructor(
		private readonly ids: IdGenerator,
		private readonly clock: Clock,
	) {}

	public headerFor(run: AgentRun, causedBy?: EventId): EventHeader {
		return new EventHeader(
			EventId.from(this.ids.next()),
			this.clock.now(),
			new EventCorrelation(run.id, AgentId.from(run.agent.value), run.correlationId, causedBy),
		);
	}
}
