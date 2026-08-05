import { Clock } from "../../common/time/clock";
import { Instant } from "../../common/time/instant";

/** The wall clock, which is what an application runs on when it does not say otherwise. */
export class SystemClock extends Clock {
	public now(): Instant {
		return Instant.fromEpochMillis(Date.now());
	}
}
