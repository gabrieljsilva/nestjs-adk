import { Clock } from "../common/time/clock";
import { Instant } from "../common/time/instant";
import { InvalidClockAdvanceError } from "./errors/invalid-clock-advance.error";

/** Fixed starting point, so a run that never advances the clock still produces stable output. */
const DEFAULT_START = "2026-01-01T00:00:00.000Z";

/**
 * Clock that never reads the system time.
 * It only moves when a test asks it to, which keeps timestamps reproducible.
 */
export class FakeClock extends Clock {
	private current: Instant;

	public constructor(start: Instant = Instant.fromIso(DEFAULT_START)) {
		super();
		this.current = start;
	}

	public now(): Instant {
		return this.current;
	}

	public advance(millis: number): Instant {
		if (!Number.isSafeInteger(millis) || millis < 0) throw new InvalidClockAdvanceError(millis);
		this.current = this.current.plusMillis(millis);
		return this.current;
	}

	public set(instant: Instant): void {
		this.current = instant;
	}
}
