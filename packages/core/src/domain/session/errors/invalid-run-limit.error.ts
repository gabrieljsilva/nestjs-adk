import { AdkError } from "../../../common/errors/adk.error";

/** A run limit declared with a number that cannot bound anything, refused where it was written. */
export class InvalidRunLimitError extends AdkError {
	public readonly code = "INVALID_RUN_LIMIT";

	public constructor(
		public readonly limit: string,
		public readonly value: number,
	) {
		super(`Run limit ${limit} must be a positive whole number, and ${value} is not.`);
	}
}
