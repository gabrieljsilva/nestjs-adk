import type { SessionRevision } from "../../../common/revision/session-revision";
import type { SessionState } from "../../../domain/session/state/session-state";
import { SnapshotPolicy } from "./snapshot-policy";

const DEFAULT_EVERY_EVENTS = 50;

/**
 * Snapshots whenever the journal crosses a multiple of a declared number of events.
 *
 * The threshold is explicit rather than implicit: an application that suspends often
 * wants a lower number, and one with short sessions may never want a snapshot at all.
 * A turn waiting for approval always writes one, because that is exactly the state a
 * later process will need to rehydrate, and the wait has no bound.
 *
 * The count is read from the revision itself rather than from the last snapshot: the
 * decision happens inside a commit, which knows the revision before and after it and
 * would otherwise need an extra read of storage to learn anything else. Crossing a
 * multiple of the threshold is the trigger, so a snapshot that failed to be written
 * costs a later one rather than a permanent drift.
 */
export class RevisionBucketSnapshotPolicy extends SnapshotPolicy {
	private constructor(public readonly everyEvents: number) {
		super();
	}

	public static everyFiftyEvents(): RevisionBucketSnapshotPolicy {
		return new RevisionBucketSnapshotPolicy(DEFAULT_EVERY_EVENTS);
	}

	public static every(events: number): RevisionBucketSnapshotPolicy {
		return new RevisionBucketSnapshotPolicy(Math.max(1, Math.trunc(events)));
	}

	public shouldSnapshot(before: SessionRevision, after: SessionRevision, state: SessionState): boolean {
		if (state.isAwaitingApproval) return true;
		return this.bucketOf(after) > this.bucketOf(before);
	}

	private bucketOf(revision: SessionRevision): number {
		return Math.floor(revision.value / this.everyEvents);
	}
}
