import type { EventId } from "../../common/identity/event-id";
import type { Instant } from "../../common/time/instant";
import type { EventCorrelation } from "./event-correlation";

/**
 * The part every event carries regardless of its type.
 * Codecs decode only the payload; the header is rebuilt once, by the registry.
 */
export class EventHeader {
	public constructor(
		public readonly id: EventId,
		public readonly occurredAt: Instant,
		public readonly correlation: EventCorrelation,
	) {}
}
