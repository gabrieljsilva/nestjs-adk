import { StoredRow } from "../stored-row.record";

/** One stored event, as the columns a storage adapter writes and reads back. */
export class JournalRecord {
	public constructor(
		public readonly eventId: string,
		public readonly type: string,
		public readonly schemaVersion: number,
		public readonly occurredAt: string,
		public readonly runId: string,
		public readonly agentId: string,
		public readonly correlationId: string,
		public readonly causationId: string | undefined,
		public readonly payload: Readonly<Record<string, unknown>>,
	) {}

	public static from(values: unknown): JournalRecord {
		if (values instanceof JournalRecord) return values;
		const row = new StoredRow(values);
		return new JournalRecord(
			row.text("eventId"),
			row.text("type"),
			row.integer("schemaVersion"),
			row.text("occurredAt"),
			row.text("runId"),
			row.text("agentId"),
			row.text("correlationId"),
			row.optionalText("causationId"),
			row.json("payload"),
		);
	}
}
