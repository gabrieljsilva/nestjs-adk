import type { SessionRevision } from "../../../common/revision/session-revision";
import type { SessionState } from "../../../domain/session/session-state";

/**
 * Decides when writing a snapshot is worth it.
 *
 * It is a port, so an application that snapshots on a clock, on a size or never writes one
 * and plugs it into `RuntimeOptions.snapshots`. What ships is
 * {@link RevisionBucketSnapshotPolicy}.
 *
 * Whatever the rule, it answers from what a commit already has in hand: the revision before
 * it, the revision after it and the state it produced. Asking storage anything here would
 * add a read to every commit to serve an optimization.
 */
export abstract class SnapshotPolicy {
	public abstract shouldSnapshot(before: SessionRevision, after: SessionRevision, state: SessionState): boolean;
}
