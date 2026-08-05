import type { ContentDigest } from "../../common/digest/content-digest";
import type { SessionId } from "../../common/identity/session-id";
import type { SessionRevision } from "../../common/revision/session-revision";
import type { SessionState } from "./session-state";

/**
 * A shortcut to a state the journal can always rebuild.
 *
 * A snapshot is disposable by design: it is only ever an optimization, so anything
 * suspicious about it means a full replay, never a failed rehydration. It records the
 * projector that wrote it and a checksum of the state, which is what makes those
 * doubts detectable instead of silent.
 */
export class SessionSnapshot {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly revision: SessionRevision,
		public readonly projectorVersion: number,
		public readonly state: SessionState,
		public readonly checksum: ContentDigest,
	) {}

	/** True when this snapshot can be trusted for the given projector and head revision. */
	public isUsableAt(projectorVersion: number, head: SessionRevision, expected: ContentDigest): boolean {
		if (this.projectorVersion !== projectorVersion) return false;
		if (!this.checksum.equals(expected)) return false;
		return !this.revision.isAfter(head);
	}
}
