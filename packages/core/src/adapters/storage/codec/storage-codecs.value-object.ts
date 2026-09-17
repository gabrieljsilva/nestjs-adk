import { SessionEventCodecs } from "../../../domain/event/session-event-codecs.factory";
import type { SessionEventRegistry } from "../../../domain/event/session-event-registry.service";
import { CheckpointCodec } from "./checkpoint/checkpoint.codec";
import { JournalCodec } from "./journal/journal.codec";
import { SessionHeadCodec } from "./session-head/session-head.codec";
import { SnapshotCodec } from "./snapshot/snapshot.codec";

/**
 * One codec per collection a `SessionStorage` keeps, as one thing to hold. A storage adapter
 * moves rows and decides about revisions and races; what a row means is these codecs' business.
 *
 * Pass an event registry when the application registered upcasters of its own, otherwise the
 * journal is read through a registry that never heard of them.
 */
export class StorageCodecs {
	private constructor(
		public readonly journal: JournalCodec,
		public readonly snapshot: SnapshotCodec,
		public readonly head: SessionHeadCodec,
		public readonly checkpoint: CheckpointCodec,
	) {}

	public static standard(registry: SessionEventRegistry = SessionEventCodecs.registry()): StorageCodecs {
		return new StorageCodecs(
			new JournalCodec(registry),
			new SnapshotCodec(),
			new SessionHeadCodec(),
			new CheckpointCodec(),
		);
	}
}
