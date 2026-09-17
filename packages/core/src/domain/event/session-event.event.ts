import type { EventId } from "../../common/identity/event-id.value-object";
import type { Instant } from "../../common/time/instant.value-object";
import type { EventCorrelation } from "./event-correlation.value-object";
import type { EventSchemaVersion } from "./event-schema-version.value-object";

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
