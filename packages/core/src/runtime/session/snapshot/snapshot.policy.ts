import type { SessionRevision } from "../../../common/revision/session-revision.value-object";
import type { SessionState } from "../../../domain/session/state/session-state.value-object";

export abstract class SnapshotPolicy {
	public abstract shouldSnapshot(before: SessionRevision, after: SessionRevision, state: SessionState): boolean;
}
