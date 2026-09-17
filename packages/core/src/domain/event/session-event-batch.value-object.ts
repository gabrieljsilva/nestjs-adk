import type { AgentName } from "../agent/agent-name.value-object";
import { AgentTransferred } from "./catalog/transfer/agent-transferred.event";
import { DuplicatedEventIdError } from "./errors/duplicated-event-id.error";
import type { SessionEvent } from "./session-event.event";

/**
 * The events one command produced, committed together or not at all.
 * Ids are unique inside the batch, so idempotent append downstream can rely on the id
 * without first having to defend itself against the producer.
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

	/**
	 * The agent this batch handed the session to, or nothing when it handed it to nobody.
	 *
	 * A handover is read from the batch that was just committed rather than from the folded
	 * state: the state carries the active agent of every previous run as well, and a reader of
	 * it cannot tell "this session has belonged to billing since yesterday" from "this turn
	 * just transferred". The last one wins, because a batch that transferred twice ends where
	 * its last event left it.
	 */
	public findTransferTarget(): AgentName | undefined {
		return this.events.filter((event) => event instanceof AgentTransferred).at(-1)?.to;
	}
}
