import { AdkError } from "./adk.error";

export class InvalidDurationError extends AdkError {
	public readonly code = "COMMON_INVALID_DURATION";

	public constructor(public readonly received: number) {
		super(`Duration requires a non negative whole number of milliseconds, received ${JSON.stringify(received)}.`);
	}
}
