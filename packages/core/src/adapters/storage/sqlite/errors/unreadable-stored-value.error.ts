import { AdkError } from "../../../../common/errors/adk.error";

/**
 * A stored value no longer maps to anything this version of the code knows.
 * It usually means a row written by a newer build, which is worth saying out loud rather
 * than quietly restoring a session into a state that does not exist.
 */
export class UnreadableStoredValueError extends AdkError {
	public readonly code = "UNREADABLE_STORED_VALUE";

	public constructor(
		public readonly column: string,
		public readonly value: string,
	) {
		super(`Stored ${column} "${value}" is not a value this runtime knows.`);
	}
}
