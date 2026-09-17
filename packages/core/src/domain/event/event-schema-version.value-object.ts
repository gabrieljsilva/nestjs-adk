import { InvalidEventSchemaVersionError } from "./errors/invalid-event-schema-version.error";

/** Version of the payload shape of one event type. */
export class EventSchemaVersion {
	public constructor(public readonly value: number) {
		if (!Number.isSafeInteger(value) || value < 1) throw new InvalidEventSchemaVersionError(value);
	}

	public static initial(): EventSchemaVersion {
		return new EventSchemaVersion(1);
	}

	public isAfter(other: EventSchemaVersion): boolean {
		return this.value > other.value;
	}

	public equals(other: EventSchemaVersion): boolean {
		return this.value === other.value;
	}

	public toString(): string {
		return `v${this.value}`;
	}
}
