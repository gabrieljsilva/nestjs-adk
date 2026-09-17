import type { EventId } from "../../common/identity/event-id.value-object";
import type { Instant } from "../../common/time/instant.value-object";
import type { EventCorrelation } from "./event-correlation.value-object";
import type { EventSchemaVersion } from "./event-schema-version.value-object";

/**
 * One immutable fact that happened during a run, and the source of truth a session's
 * state is projected from. `type` is the key the codec registry resolves on the way back.
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
