import type { EventSchemaVersion } from "./event-schema-version";

/**
 * Rewrites a payload from one schema version to the next.
 *
 * An upcaster is pure: it returns a new record and never touches the one it received,
 * so replaying the same journal twice produces the same events.
 */
export abstract class EventUpcaster {
	public abstract readonly type: string;
	public abstract readonly from: EventSchemaVersion;
	public abstract readonly to: EventSchemaVersion;

	public abstract upcast(payload: Readonly<Record<string, unknown>>): Record<string, unknown>;
}
