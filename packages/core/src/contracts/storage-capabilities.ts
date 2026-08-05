/**
 * What a storage adapter honestly claims to guarantee.
 *
 * An adapter without optimistic concurrency cannot serve durable sessions: two
 * processes would silently overwrite each other. Declaring capabilities lets the
 * conformance suite hold each adapter to what it promised, instead of assuming
 * every implementation is as strong as the reference one.
 */
export class StorageCapabilities {
	private constructor(
		public readonly optimisticConcurrency: boolean,
		public readonly idempotentAppend: boolean,
		public readonly snapshots: boolean,
		/** Compaction checkpoints are an optimization, so an adapter may honestly not keep them. */
		public readonly checkpoints: boolean = true,
	) {}

	public static durable(options: { snapshots: boolean; checkpoints?: boolean }): StorageCapabilities {
		return new StorageCapabilities(true, true, options.snapshots, options.checkpoints ?? true);
	}

	/** No concurrency control: usable within one process, never for a durable session. */
	public static ephemeral(): StorageCapabilities {
		return new StorageCapabilities(false, false, false, false);
	}

	public get supportsDurableSessions(): boolean {
		return this.optimisticConcurrency && this.idempotentAppend;
	}
}
