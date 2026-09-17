import { StoredRow } from "../stored-row.record";

/** One stored compaction checkpoint, as the columns a storage adapter writes and reads back. */
export class CheckpointRecord {
	public constructor(
		public readonly sessionId: string,
		public readonly coveredRevision: number,
		public readonly strategy: string,
		public readonly strategyVersion: number,
		public readonly prefixDigestAlgorithm: string,
		public readonly prefixDigestValue: string,
		public readonly blocks: readonly unknown[],
		public readonly key: string,
	) {}

	public static from(values: unknown): CheckpointRecord {
		if (values instanceof CheckpointRecord) return values;
		const row = new StoredRow(values);
		return new CheckpointRecord(
			row.text("sessionId"),
			row.integer("coveredRevision"),
			row.text("strategy"),
			row.integer("strategyVersion"),
			row.text("prefixDigestAlgorithm"),
			row.text("prefixDigestValue"),
			row.array("blocks"),
			row.text("key"),
		);
	}
}
