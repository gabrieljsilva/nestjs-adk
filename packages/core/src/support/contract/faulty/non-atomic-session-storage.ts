import { InMemorySessionStorage } from "../../../adapters/storage/in-memory-session-storage";
import { AppendEventsCommand } from "../../../contracts/append-events-command";
import type { AppendEventsResult } from "../../../contracts/append-events-result";
import { SessionEventBatch } from "../../../domain/event/session-event-batch";

/**
 * Breaks atomicity by persisting only the first event of a multi event batch: a command lands half applied and the
 * journal stops explaining the state, so a replay rebuilds a session that never existed.
 */
export class NonAtomicSessionStorage extends InMemorySessionStorage {
	public override async append(command: AppendEventsCommand): Promise<AppendEventsResult> {
		const first = command.batch.events[0];
		if (command.batch.size <= 1 || first === undefined) return super.append(command);
		return super.append(
			new AppendEventsCommand(command.sessionId, command.expectedRevision, SessionEventBatch.of([first])),
		);
	}
}
