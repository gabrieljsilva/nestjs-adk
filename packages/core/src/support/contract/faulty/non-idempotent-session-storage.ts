import { InMemorySessionStorage } from "../../../adapters/storage/in-memory-session-storage";
import { AgentId } from "../../../common/identity/agent-id";
import { AgentRunId } from "../../../common/identity/agent-run-id";
import { CorrelationId } from "../../../common/identity/correlation-id";
import { EventId } from "../../../common/identity/event-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { Instant } from "../../../common/time/instant";
import { AppendEventsCommand } from "../../../contracts/append-events-command";
import type { AppendEventsResult } from "../../../contracts/append-events-result";
import { AgentName } from "../../../domain/agent/agent-name";
import { SessionCreated } from "../../../domain/event/catalog/session-created";
import { EventCorrelation } from "../../../domain/event/event-correlation";
import { EventHeader } from "../../../domain/event/event-header";
import type { SessionEvent } from "../../../domain/event/session-event";
import { SessionEventBatch } from "../../../domain/event/session-event-batch";

const AGENT = AgentName.from("faulty");
const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");

/**
 * Breaks idempotent append by writing a batch again on retry instead of answering with what was already committed:
 * one timeout on the caller side doubles every event of the batch, and the projection counts each fact twice.
 */
export class NonIdempotentSessionStorage extends InMemorySessionStorage {
	private decoys = 0;

	public override async append(command: AppendEventsCommand): Promise<AppendEventsResult> {
		if (!(await this.isRetry(command))) return super.append(command);

		const head = (await this.findOrFail(command.sessionId)).revision;
		const forced = SessionEventBatch.of([...command.batch.events, this.unseenEvent()]);
		return super.append(new AppendEventsCommand(command.sessionId, head, forced));
	}

	private async isRetry(command: AppendEventsCommand): Promise<boolean> {
		if (command.batch.isEmpty) return false;

		const written = new Set<string>();
		for await (const stored of this.readEvents(command.sessionId, SessionRevision.initial())) {
			written.add(stored.event.id.value);
		}
		return command.batch.events.every((event) => written.has(event.id.value));
	}

	/** An id the journal has never seen, which is what keeps the replay check from recognizing the retry. */
	private unseenEvent(): SessionEvent {
		this.decoys += 1;
		const header = new EventHeader(
			EventId.from(`decoy-${this.decoys}`),
			NOW,
			new EventCorrelation(AgentRunId.from("r-faulty"), AgentId.from("a-faulty"), CorrelationId.from("c-faulty")),
		);
		return new SessionCreated(header, AGENT, undefined);
	}
}
