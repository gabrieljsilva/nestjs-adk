import { Clock } from "../common/time/clock.contract";
import type { Duration } from "../common/time/duration.value-object";
import { Instant } from "../common/time/instant.value-object";
import { InvalidClockAdvanceError } from "./errors/invalid-clock-advance.error";

/** Fixed starting point, so a run that never advances the clock still produces stable output. */
const DEFAULT_START = "2026-01-01T00:00:00.000Z";

/**
 * Clock that never reads the system time.
 * It only moves when a test asks it to, which keeps timestamps reproducible.
 */
export class FakeClock extends Clock {
	private current: Instant;
	private readonly slept: Duration[] = [];

	public constructor(start: Instant = Instant.fromIso(DEFAULT_START)) {
		super();
		this.current = start;
	}

	public now(): Instant {
		return this.current;
	}

	/**
	 * Advances instead of waiting, and records what it was asked to wait for.
	 *
	 * That record is the assertion a backoff spec actually wants: the question is whether the
	 * policy asked for the right delay, not whether the process stood still for it.
	 */
	public override async sleep(duration: Duration): Promise<void> {
		this.slept.push(duration);
		this.advance(duration.millis);
	}

	/** Every delay this clock was asked for, in order. */
	public get sleeps(): readonly Duration[] {
		return this.slept;
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
