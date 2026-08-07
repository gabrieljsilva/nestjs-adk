import { SessionEventCodecs } from "../../../domain/event/session-event-codecs";
import type { SessionEventRegistry } from "../../../domain/event/session-event-registry";
import { CheckpointCodec } from "./checkpoint-codec";
import { JournalCodec } from "./journal-codec";
import { SessionHeadCodec } from "./session-head-codec";
import { SnapshotCodec } from "./snapshot-codec";

/**
 * One codec per collection a `SessionStorage` keeps, as one thing to hold.
 *
 * An adapter implementing the port moves rows and decides about revisions, transactions
 * and races. What a row means is not its business, and every attempt to make it so ends
 * with the concrete event classes and the value objects behind them leaving this package,
 * where they can never be changed again.
 *
 * A registry can be handed in for an application that registered upcasters of its own:
 * without it, the storage holding that journal would read it through a registry that has
 * never heard of them.
 */
export class StorageCodecs {
	private constructor(
		public readonly journal: JournalCodec,
		public readonly snapshot: SnapshotCodec,
		public readonly head: SessionHeadCodec,
		public readonly checkpoint: CheckpointCodec,
	) {}

	/** A fresh set every call: two runtimes in one process must never share a registry. */
	public static standard(registry: SessionEventRegistry = SessionEventCodecs.registry()): StorageCodecs {
		return new StorageCodecs(
			new JournalCodec(registry),
			new SnapshotCodec(),
			new SessionHeadCodec(),
			new CheckpointCodec(),
		);
	}
}
