import { Clock } from "./clock.contract";
import { Instant } from "./instant.value-object";

/** The wall clock, and the default when an application declares no other. */
export class SystemClock extends Clock {
	public now(): Instant {
		return Instant.fromEpochMillis(Date.now());
	}
}
