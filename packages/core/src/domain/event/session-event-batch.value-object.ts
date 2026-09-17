import type { AgentName } from "../agent/agent-name.value-object";
import { AgentTransferred } from "./catalog/transfer/agent-transferred.event";
import { DuplicatedEventIdError } from "./errors/duplicated-event-id.error";
import type { SessionEvent } from "./session-event.event";

/**
 * The events one command produced, committed together or not at all.
 * Throws `DuplicatedEventIdError` when two of them share an id, which idempotent append
 * downstream relies on.
 */
export class SessionEventBatch {
	public readonly events: readonly SessionEvent[];

	public constructor(events: readonly SessionEvent[]) {
		const seen = new Set<string>();
		for (const event of events) {
			if (seen.has(event.id.value)) throw new DuplicatedEventIdError(event.id.value);
			seen.add(event.id.value);
		}
		this.events = [...events];
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

	public findTransferTarget(): AgentName | undefined {
		return this.events.filter((event) => event instanceof AgentTransferred).at(-1)?.to;
	}
}
