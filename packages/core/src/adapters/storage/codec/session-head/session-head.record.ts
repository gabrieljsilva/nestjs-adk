import { StoredRow } from "../stored-row.record";

/** One stored session head, as the columns a storage adapter writes and reads back. */
export class SessionHeadRecord {
	public constructor(
		public readonly id: string,
		public readonly rootAgent: string,
		public readonly status: string,
		public readonly revision: number,
		public readonly createdAt: string,
		public readonly updatedAt: string,
	) {}

	public static from(values: unknown): SessionHeadRecord {
		if (values instanceof SessionHeadRecord) return values;
		const row = new StoredRow(values);
		return new SessionHeadRecord(
			row.text("id"),
			row.text("rootAgent"),
			row.text("status"),
			row.integer("revision"),
			row.text("createdAt"),
			row.text("updatedAt"),
		);
	}
}
