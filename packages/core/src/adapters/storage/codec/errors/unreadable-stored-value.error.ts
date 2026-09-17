import { AdkError } from "../../../../common/errors/adk.error";

/** A stored column holds a value this build does not know, such as a status written by a newer one. */
export class UnreadableStoredValueError extends AdkError {
	public readonly code = "UNREADABLE_STORED_VALUE";

	public constructor(
		public readonly column: string,
		public readonly value: string,
	) {
		super(`Stored ${column} "${value}" is not a value this runtime knows.`);
	}
}
