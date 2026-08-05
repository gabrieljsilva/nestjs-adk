import { AdkError } from "../../common/errors/adk.error";

/** Time only moves forward, including in tests. */
export class InvalidClockAdvanceError extends AdkError {
	public readonly code = "SUPPORT_INVALID_CLOCK_ADVANCE";

	public constructor(public readonly received: number) {
		super(`FakeClock.advance requires a non-negative duration in milliseconds, received ${received}.`);
	}
}
