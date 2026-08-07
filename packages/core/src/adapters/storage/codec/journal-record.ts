import { StoredRow } from "./stored-row";

/**
 * One event as a row: nine plain values a database column can hold, and nothing else.
 *
 * The session and the revision are deliberately absent. Which revision an event lands on
 * is the storage's decision, taken inside its own transaction, and an event that carried
 * one would let two writers disagree about the order of a journal they both wrote to.
 */
export class JournalRecord {
	public constructor(
		public readonly eventId: string,
		public readonly type: string,
		public readonly schemaVersion: number,
		/** ISO 8601, which is the one timestamp format every driver stores without losing it. */
		public readonly occurredAt: string,
		public readonly runId: string,
		public readonly agentId: string,
		public readonly correlationId: string,
		public readonly causationId: string | undefined,
		public readonly payload: Readonly<Record<string, unknown>>,
	) {}

	/** The same record, read back out of whatever a driver handed the adapter. */
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
