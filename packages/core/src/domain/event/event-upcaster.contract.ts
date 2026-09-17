import type { EventSchemaVersion } from "./event-schema-version.value-object";

export abstract class EventUpcaster {
	public abstract readonly type: string;
	public abstract readonly from: EventSchemaVersion;
	public abstract readonly to: EventSchemaVersion;

	public abstract upcast(payload: Readonly<Record<string, unknown>>): Record<string, unknown>;
}
