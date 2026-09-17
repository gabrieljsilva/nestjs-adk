import {
	AppendEventsCommand,
	type AppendEventsResult,
	InMemorySessionStorage,
	type SessionContext,
	type SessionEvent,
	SessionEventBatch,
	SessionRevision,
	StorageCodecs,
} from "@nestjs-adk/core";

const NOW = "2026-01-01T00:00:00.000Z";

/**
 * Breaks idempotent append by writing a batch again on retry instead of answering with what was already committed:
 * one timeout on the caller side doubles every event of the batch, and the projection counts each fact twice.
 */
export class NonIdempotentSessionStorage extends InMemorySessionStorage {
	private readonly codecs = StorageCodecs.standard();
	private decoys = 0;

	public override async append(context: SessionContext, command: AppendEventsCommand): Promise<AppendEventsResult> {
		if (!(await this.isRetry(context, command))) return super.append(context, command);

		const head = (await this.findOrFail(context)).revision;
		const forced = new SessionEventBatch([...command.batch.events, this.unseenEvent()]);
		return super.append(context, new AppendEventsCommand(command.sessionId, head, forced));
	}

	private async isRetry(context: SessionContext, command: AppendEventsCommand): Promise<boolean> {
		if (command.batch.isEmpty) return false;

		const written = new Set<string>();
		for await (const stored of this.readEvents(context, SessionRevision.initial())) {
			written.add(stored.event.id.value);
		}
		return command.batch.events.every((event) => written.has(event.id.value));
	}

	/** An id the journal has never seen, which is what keeps the replay check from recognizing the retry. */
	private unseenEvent(): SessionEvent {
		this.decoys += 1;
		return this.codecs.journal.decode({
			eventId: `decoy-${this.decoys}`,
			type: "session.created",
			schemaVersion: 1,
			occurredAt: NOW,
			runId: "r-faulty",
			agentId: "a-faulty",
			correlationId: "c-faulty",
			causationId: undefined,
			payload: { rootAgent: "faulty", actorId: null },
		});
	}
}
