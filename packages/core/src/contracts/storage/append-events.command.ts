import type { SessionId } from "../../common/identity/session-id.value-object";
import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { SessionEventBatch } from "../../domain/event/session-event-batch.value-object";

/**
 * One atomic write to a journal. `expectedRevision` is the whole of the concurrency control:
 * the storage writes the batch only if the session is still exactly there.
 */
export class AppendEventsCommand {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly expectedRevision: SessionRevision,
		public readonly batch: SessionEventBatch,
	) {}
}
