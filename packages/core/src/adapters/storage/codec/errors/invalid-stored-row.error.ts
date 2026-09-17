import { AdkError } from "../../../../common/errors/adk.error";

/** A stored column does not hold what the codec expected there; the message names both. */
export class InvalidStoredRowError extends AdkError {
	public readonly code = "INVALID_STORED_ROW";

	public constructor(
		public readonly column: string,
		public readonly expected: string,
	) {
		super(`Stored column ${column} does not hold ${expected}.`);
	}
}
