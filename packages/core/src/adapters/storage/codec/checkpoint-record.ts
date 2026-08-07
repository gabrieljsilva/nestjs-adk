import { StoredRow } from "./stored-row";

/**
 * A compacted prefix as a row.
 *
 * The key is stored next to the parts it is built from because that is what an upsert
 * keys on: writing the same checkpoint twice has to write it once, and a storage that
 * derived the key itself would be deciding what identity means for a domain object.
 */
export class CheckpointRecord {
	public constructor(
		public readonly sessionId: string,
		public readonly coveredRevision: number,
		public readonly strategy: string,
		public readonly strategyVersion: number,
		public readonly prefixDigestAlgorithm: string,
		public readonly prefixDigestValue: string,
		public readonly blocks: readonly unknown[],
		public readonly composition: Readonly<Record<string, unknown>>,
		/** Identity of the checkpoint: session, covered revision and strategy version. */
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
			row.json("composition"),
			row.text("key"),
		);
	}
}
