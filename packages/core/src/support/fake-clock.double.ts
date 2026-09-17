import { Clock } from "../common/time/clock.contract";
import type { Duration } from "../common/time/duration.value-object";
import { Instant } from "../common/time/instant.value-object";
import { InvalidClockAdvanceError } from "./errors/invalid-clock-advance.error";

const DEFAULT_START = "2026-01-01T00:00:00.000Z";

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

	public override async sleep(duration: Duration): Promise<void> {
		this.slept.push(duration);
		this.advance(duration.millis);
	}

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
