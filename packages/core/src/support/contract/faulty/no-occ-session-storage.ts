import { InMemorySessionStorage } from "../../../adapters/storage/in-memory-session-storage";
import { AppendEventsCommand } from "../../../contracts/append-events-command";
import type { AppendEventsResult } from "../../../contracts/append-events-result";

/**
 * Breaks optimistic concurrency by writing at the current head whatever `expectedRevision` says, while still
 * declaring durable capabilities: two writers would both commit and the second would erase the first decision.
 */
export class NoOccSessionStorage extends InMemorySessionStorage {
	public override async append(command: AppendEventsCommand): Promise<AppendEventsResult> {
		const session = await this.findOrFail(command.sessionId);
		return super.append(new AppendEventsCommand(command.sessionId, session.revision, command.batch));
	}
}
