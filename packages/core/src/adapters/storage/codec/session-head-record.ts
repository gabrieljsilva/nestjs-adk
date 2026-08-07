import { StoredRow } from "./stored-row";

/** The head of a conversation as a row: who owns it, where it stands and how far it got. */
export class SessionHeadRecord {
	public constructor(
		public readonly id: string,
		public readonly rootAgent: string,
		public readonly mode: string,
		public readonly status: string,
		public readonly revision: number,
		/** ISO 8601, which is the one timestamp format every driver stores without losing it. */
		public readonly createdAt: string,
		public readonly updatedAt: string,
		public readonly owner: string | undefined,
	) {}

	public static from(values: unknown): SessionHeadRecord {
		if (values instanceof SessionHeadRecord) return values;
		const row = new StoredRow(values);
		return new SessionHeadRecord(
			row.text("id"),
			row.text("rootAgent"),
			row.text("mode"),
			row.text("status"),
			row.integer("revision"),
			row.text("createdAt"),
			row.text("updatedAt"),
			row.optionalText("owner"),
		);
	}
}
