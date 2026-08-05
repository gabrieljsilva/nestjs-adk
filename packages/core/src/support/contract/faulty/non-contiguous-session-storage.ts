import { InMemorySessionStorage } from "../../../adapters/storage/in-memory-session-storage";
import { SessionRevision } from "../../../common/revision/session-revision";
import type { AppendEventsCommand } from "../../../contracts/append-events-command";
import { AppendEventsResult } from "../../../contracts/append-events-result";
import { StoredSessionEvent } from "../../../domain/event/stored-session-event";

/** How much this storage moves the revision per event, instead of the single step a gapless journal requires. */
const REVISION_STEP = 2;

/**
 * Breaks contiguity by advancing revisions two at a time: a reader can no longer tell a hole in the journal from an
 * event that was lost on the way, so every replay has to guess whether the history it holds is complete.
 */
export class NonContiguousSessionStorage extends InMemorySessionStorage {
	public override async append(command: AppendEventsCommand): Promise<AppendEventsResult> {
		const result = await super.append(command);
		const base = command.expectedRevision.value;
		const stretched = result.committed.map(
			(stored, index) =>
				new StoredSessionEvent(stored.sessionId, SessionRevision.of(base + (index + 1) * REVISION_STEP), stored.event),
		);
		const last = stretched.at(-1);
		return new AppendEventsResult(stretched, last === undefined ? result.revision : last.revision);
	}
}
