import { AdkError } from "../../common/errors/adk.error";

export class InvalidClockAdvanceError extends AdkError {
	public readonly code = "SUPPORT_INVALID_CLOCK_ADVANCE";

	public constructor(public readonly received: number) {
		super(`FakeClock.advance requires a non-negative duration in milliseconds, received ${received}.`);
	}
}
