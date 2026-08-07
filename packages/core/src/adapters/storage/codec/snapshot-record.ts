import { StoredRow } from "./stored-row";

/** A projected state as a row, with the checksum that decides whether it can be trusted. */
export class SnapshotRecord {
	public constructor(
		public readonly sessionId: string,
		public readonly revision: number,
		public readonly projectorVersion: number,
		public readonly checksumAlgorithm: string,
		public readonly checksumValue: string,
		public readonly state: Readonly<Record<string, unknown>>,
	) {}

	public static from(values: unknown): SnapshotRecord {
		if (values instanceof SnapshotRecord) return values;
		const row = new StoredRow(values);
		return new SnapshotRecord(
			row.text("sessionId"),
			row.integer("revision"),
			row.integer("projectorVersion"),
			row.text("checksumAlgorithm"),
			row.text("checksumValue"),
			row.json("state"),
		);
	}
}
