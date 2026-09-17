import type { ContentDigest } from "../../../common/digest/content-digest.value-object";
import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { SessionRevision } from "../../../common/revision/session-revision.value-object";
import type { SessionState } from "./session-state.value-object";

/**
 * A shortcut to a state the journal can always rebuild.
 *
 * It is disposable by design: anything suspicious about it means a full replay, never a failed
 * rehydration, which is what the projector version and the checksum make detectable.
 */
export class SessionSnapshot {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly revision: SessionRevision,
		public readonly projectorVersion: number,
		public readonly state: SessionState,
		public readonly checksum: ContentDigest,
	) {}

	public isUsableAt(projectorVersion: number, head: SessionRevision, expected: ContentDigest): boolean {
		if (this.projectorVersion !== projectorVersion) return false;
		if (!this.checksum.equals(expected)) return false;
		return !this.revision.isAfter(head);
	}
}
