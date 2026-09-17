import {
	type AppendEventsCommand,
	AppendEventsResult,
	InMemorySessionStorage,
	type SessionContext,
	SessionRevision,
	StoredSessionEvent,
} from "@nestjs-adk/core";

const REVISION_STEP = 2;

export class NonContiguousSessionStorage extends InMemorySessionStorage {
	public override async append(context: SessionContext, command: AppendEventsCommand): Promise<AppendEventsResult> {
		const result = await super.append(context, command);
		const base = command.expectedRevision.value;
		const stretched = result.committed.map(
			(stored, index) =>
				new StoredSessionEvent(stored.sessionId, new SessionRevision(base + (index + 1) * REVISION_STEP), stored.event),
		);
		const last = stretched.at(-1);
		return new AppendEventsResult(stretched, last === undefined ? result.revision : last.revision);
	}
}
