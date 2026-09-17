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
	redactor?: EventRedactor;
}

/**
 * What happens around a run rather than inside one: who is told about it, what they are
 * allowed to see, what is snapshotted so a long conversation stays cheap to reopen, and how
 * long a shutdown waits for the runs still going.
 *
 * The redactor guards both doors: what a consumer may not read is also kept out of a stored
 * projection.
 */
export class LifecycleOptions {
	public constructor(
		public readonly shutdown: ShutdownOptions = ShutdownOptions.waitIndefinitely(),
		public readonly snapshots: SnapshotPolicy = RevisionBucketSnapshotPolicy.everyFiftyEvents(),
		public readonly consumers: readonly SessionEventConsumer[] = [],
		public readonly consumerNotices?: ConsumerFailureSink,
		public readonly redactor: EventRedactor = new FieldNameEventRedactor(),
	) {}

	public static from(patch: LifecycleOptionsPatch): LifecycleOptions {
		return new LifecycleOptions().with(patch);
	}

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
