import { AdkError } from "../../../../common/errors/adk.error";

/** A stored row does not hold what this version of the code expects to read there. */
export class InvalidStoredRowError extends AdkError {
	public readonly code = "INVALID_STORED_ROW";

	public constructor(
		public readonly column: string,
		public readonly expected: string,
	) {
		super(`Stored column ${column} does not hold ${expected}.`);
	}
}
