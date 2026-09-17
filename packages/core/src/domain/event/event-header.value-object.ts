import type { EventId } from "../../common/identity/event-id.value-object";
import type { Instant } from "../../common/time/instant.value-object";
import type { EventCorrelation } from "./event-correlation.value-object";

export class EventHeader {
	public constructor(
		public readonly id: EventId,
		public readonly occurredAt: Instant,
		public readonly correlation: EventCorrelation,
	) {}
}
