import { AdkError } from "./adk.error";

/** A session revision must be a safe, non-negative integer. */
export class InvalidRevisionError extends AdkError {
	public readonly code = "COMMON_INVALID_REVISION";

	public constructor(public readonly received: number) {
		super(`SessionRevision requires a non-negative safe integer, received ${received}.`);
	}
}
