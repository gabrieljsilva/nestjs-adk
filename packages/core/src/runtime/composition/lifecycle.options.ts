import type { ConsumerFailureSink } from "../../contracts/events/consumer-failure-sink.contract";
import type { SessionEventConsumer } from "../../contracts/events/session-event-consumer.contract";
import type { EventRedactor } from "../event/event-redactor.contract";
import { FieldNameEventRedactor } from "../event/field-name-event-redactor.adapter";
import { ShutdownOptions } from "../lifecycle/shutdown.options";
import { RevisionBucketSnapshotPolicy } from "../session/snapshot/revision-bucket-snapshot.policy";
import type { SnapshotPolicy } from "../session/snapshot/snapshot.policy";

/** The fields a caller may name; one left out keeps whatever the options already hold. */
export interface LifecycleOptionsPatch {
	shutdown?: ShutdownOptions;
	snapshots?: SnapshotPolicy;
	consumers?: readonly SessionEventConsumer[];
	consumerNotices?: ConsumerFailureSink;
	/** What is masked out of a payload before a consumer reads it. */
	redactor?: EventRedactor;
}

/**
 * What happens around a run rather than inside one: who is told about it, what they are
 * allowed to see, what is written down so a long conversation stays cheap to reopen, and
 * how long a shutdown waits for the runs still going.
 *
 * The redactor sits here rather than beside the consumers it protects because a snapshot
 * is written through the same door: what a consumer may not read is what a stored
 * projection may not hold either.
 */
export class LifecycleOptions {
	public constructor(
		public readonly shutdown: ShutdownOptions = ShutdownOptions.waitIndefinitely(),
		public readonly snapshots: SnapshotPolicy = RevisionBucketSnapshotPolicy.everyFiftyEvents(),
		public readonly consumers: readonly SessionEventConsumer[] = [],
		public readonly consumerNotices?: ConsumerFailureSink,
		public readonly redactor: EventRedactor = new FieldNameEventRedactor(),
	) {}

	/** Options built from names instead of positions, with the same defaults as declaring none. */
	public static from(patch: LifecycleOptionsPatch): LifecycleOptions {
		return new LifecycleOptions().with(patch);
	}

	/** A copy with the named fields replaced and every other field kept. */
	public with(patch: LifecycleOptionsPatch): LifecycleOptions {
		return new LifecycleOptions(
			patch.shutdown ?? this.shutdown,
			patch.snapshots ?? this.snapshots,
			patch.consumers ?? this.consumers,
			patch.consumerNotices ?? this.consumerNotices,
			patch.redactor ?? this.redactor,
		);
	}
}
