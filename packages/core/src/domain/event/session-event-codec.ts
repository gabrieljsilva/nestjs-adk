import { InvalidEventPayloadError } from "./errors/invalid-event-payload.error";
import type { EventHeader } from "./event-header";
import type { EventSchemaVersion } from "./event-schema-version";
import type { SessionEvent } from "./session-event";

/**
 * Turns one event type into a payload and back.
 *
 * Decoding validates before it constructs: a record that does not satisfy the shape
 * raises `InvalidEventPayloadError` and no domain instance is ever built from it.
 */
export abstract class SessionEventCodec<TEvent extends SessionEvent> {
	public abstract readonly type: string;
	public abstract readonly schemaVersion: EventSchemaVersion;

	public abstract encode(event: TEvent): Record<string, unknown>;

	public abstract decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): TEvent;

	protected readText(payload: Readonly<Record<string, unknown>>, field: string): string {
		const value = payload[field];
		if (typeof value !== "string") throw new InvalidEventPayloadError(this.type, field, "expected a string.");
		return value;
	}

	protected readOptionalText(payload: Readonly<Record<string, unknown>>, field: string): string | undefined {
		const value = payload[field];
		if (value === undefined || value === null) return undefined;
		if (typeof value !== "string") throw new InvalidEventPayloadError(this.type, field, "expected a string.");
		return value;
	}

	protected readNumber(payload: Readonly<Record<string, unknown>>, field: string): number {
		const value = payload[field];
		if (typeof value !== "number" || !Number.isFinite(value)) {
			throw new InvalidEventPayloadError(this.type, field, "expected a finite number.");
		}
		return value;
	}

	protected readRecord(payload: Readonly<Record<string, unknown>>, field: string): Record<string, unknown> {
		const value = payload[field];
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			throw new InvalidEventPayloadError(this.type, field, "expected an object.");
		}
		return { ...value };
	}
}
