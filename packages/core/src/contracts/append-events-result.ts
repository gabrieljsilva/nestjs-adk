import type { SessionRevision } from "../common/revision/session-revision";
import type { StoredSessionEvent } from "../domain/event/stored-session-event";

/**
 * What a committed append gives back.
 * The envelopes are the source the state projection consumes: only what the storage
 * confirmed is applied, never what the caller hoped to write.
 */
export class AppendEventsResult {
	public constructor(
		public readonly committed: readonly StoredSessionEvent[],
		public readonly revision: SessionRevision,
	) {}

	public get isEmpty(): boolean {
		return this.committed.length === 0;
	}
}
