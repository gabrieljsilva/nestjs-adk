import { AgentId } from "../../../common/identity/agent-id.value-object";
import { EventId } from "../../../common/identity/event-id.value-object";
import type { IdGenerator } from "../../../common/identity/id-generator.contract";
import type { Clock } from "../../../common/time/clock.contract";
import { EventCorrelation } from "../../../domain/event/event-correlation.value-object";
import { EventHeader } from "../../../domain/event/event-header.value-object";
import type { AgentRun } from "../../../domain/session/run/agent-run.entity";

export class RunEventFactory {
	public constructor(
		private readonly ids: IdGenerator,
		private readonly clock: Clock,
	) {}

	public buildHeader(run: AgentRun, causedBy?: EventId): EventHeader {
		return new EventHeader(
			EventId.from(this.ids.next()),
			this.clock.now(),
			new EventCorrelation(run.id, AgentId.from(run.agent.value), run.correlationId, causedBy),
		);
	}
}
