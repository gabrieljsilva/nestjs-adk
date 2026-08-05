import { DuplicatedEventIdError } from "./errors/duplicated-event-id.error";
import type { SessionEvent } from "./session-event";

/**
 * The events one command produced, committed together or not at all.
 * Ids are unique inside the batch, so idempotent append downstream can rely on the id
 * without first having to defend itself against the producer.
 */
export class SessionEventBatch {
	private constructor(public readonly events: readonly SessionEvent[]) {}

	public static of(events: readonly SessionEvent[]): SessionEventBatch {
		const seen = new Set<string>();
		for (const event of events) {
			if (seen.has(event.id.value)) throw new DuplicatedEventIdError(event.id.value);
			seen.add(event.id.value);
		}
		return new SessionEventBatch([...events]);
	}

	public static empty(): SessionEventBatch {
		return new SessionEventBatch([]);
	}

	public get size(): number {
		return this.events.length;
	}

	public get isEmpty(): boolean {
		return this.events.length === 0;
	}
}
