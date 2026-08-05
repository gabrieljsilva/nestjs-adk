import type { EventId } from "../../common/identity/event-id";
import type { Instant } from "../../common/time/instant";
import type { EventCorrelation } from "./event-correlation";
import type { EventSchemaVersion } from "./event-schema-version";

/**
 * One fact that happened during a run.
 *
 * Events are the source of truth: state is a projection of them, never the other way
 * around. An instance is immutable once built, and its `type` is the key the codec
 * registry resolves on the way back from storage.
 */
export abstract class SessionEvent {
	public abstract readonly type: string;
	public abstract readonly schemaVersion: EventSchemaVersion;

	protected constructor(
		public readonly id: EventId,
		public readonly occurredAt: Instant,
		public readonly correlation: EventCorrelation,
	) {}
}
