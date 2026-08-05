import { AdkError } from "./adk.error";

/** An instant was built from a value that does not denote a point in time. */
export class InvalidInstantError extends AdkError {
	public readonly code = "COMMON_INVALID_INSTANT";

	public constructor(public readonly received: string | number) {
		super(`Instant requires a valid point in time, received ${JSON.stringify(received)}.`);
	}
}
