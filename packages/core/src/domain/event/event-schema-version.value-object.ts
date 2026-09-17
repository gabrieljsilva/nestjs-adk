import { InvalidEventSchemaVersionError } from "./errors/invalid-event-schema-version.error";

/** Version of the payload shape of one event type. */
export class EventSchemaVersion {
	private constructor(public readonly value: number) {}

	public static of(value: number): EventSchemaVersion {
		if (!Number.isSafeInteger(value) || value < 1) throw new InvalidEventSchemaVersionError(value);
		return new EventSchemaVersion(value);
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
