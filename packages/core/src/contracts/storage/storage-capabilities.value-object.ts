/**
 * What a storage adapter honestly claims to guarantee, so the contract suite holds it to what
 * it promised. An adapter without optimistic concurrency cannot be written to from two places
 * at once: the writers would silently overwrite each other.
 */
export class StorageCapabilities {
	private constructor(
		public readonly optimisticConcurrency: boolean,
		public readonly idempotentAppend: boolean,
		public readonly snapshots: boolean,
		public readonly checkpoints: boolean = true,
	) {}

	public static concurrent(options: { snapshots: boolean; checkpoints?: boolean }): StorageCapabilities {
		return new StorageCapabilities(true, true, options.snapshots, options.checkpoints ?? true);
	}

	/** No concurrency control: usable from one writer, never from two at once. */
	public static singleWriter(): StorageCapabilities {
		return new StorageCapabilities(false, false, false, false);
	}

	public get supportsConcurrentWriters(): boolean {
		return this.optimisticConcurrency && this.idempotentAppend;
	}
}
