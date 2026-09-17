import type { SessionRevision } from "../../../common/revision/session-revision.value-object";
import type { SessionState } from "../../../domain/session/state/session-state.value-object";
import { SnapshotPolicy } from "./snapshot.policy";

const DEFAULT_SNAPSHOT_EVERY_EVENTS = 50;

/**
 * Writes a snapshot whenever the journal crosses a multiple of a declared number of events,
 * fifty by default, and always when a turn stops to wait for approval.
 *
 * A snapshot that failed to be written costs a later one rather than a permanent drift.
 */
export class RevisionBucketSnapshotPolicy extends SnapshotPolicy {
	private constructor(public readonly everyEvents: number) {
		super();
	}

	public static everyFiftyEvents(): RevisionBucketSnapshotPolicy {
		return new RevisionBucketSnapshotPolicy(DEFAULT_SNAPSHOT_EVERY_EVENTS);
	}

	public static every(events: number): RevisionBucketSnapshotPolicy {
		return new RevisionBucketSnapshotPolicy(Math.max(1, Math.trunc(events)));
	}

	public shouldSnapshot(before: SessionRevision, after: SessionRevision, state: SessionState): boolean {
		if (state.isAwaitingApproval) return true;
		return this.calculateBucket(after) > this.calculateBucket(before);
	}

	private calculateBucket(revision: SessionRevision): number {
		return Math.floor(revision.value / this.everyEvents);
	}
}
