import { AdkError } from "../../../common/errors/adk.error";

/**
 * A limit was declared with a number that cannot bound anything.
 *
 * It fails where it was written rather than where it would be applied. A negative cap
 * silently read as zero would stop every run on its first iteration, and the person who
 * typed the minus sign would be looking somewhere else entirely for the reason.
 */
export class InvalidRunLimitError extends AdkError {
	public readonly code = "INVALID_RUN_LIMIT";

	public constructor(
		public readonly limit: string,
		public readonly value: number,
	) {
		super(`Run limit ${limit} must be a positive whole number, and ${value} is not.`);
	}
}
