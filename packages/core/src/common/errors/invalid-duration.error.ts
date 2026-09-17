import { AdkError } from "./adk.error";

/** A duration was built from something that is not a whole, non negative count of milliseconds. */
export class InvalidDurationError extends AdkError {
	public readonly code = "COMMON_INVALID_DURATION";

	public constructor(public readonly received: number) {
		super(`Duration requires a non negative whole number of milliseconds, received ${JSON.stringify(received)}.`);
	}
}
