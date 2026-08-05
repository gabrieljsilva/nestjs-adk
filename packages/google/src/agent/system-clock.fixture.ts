import { Clock, Instant } from "@nestjs-adk/core/native";

/** The wall clock, for a suite whose whole point is that it talks to the real world. */
export class SystemClock extends Clock {
	public now(): Instant {
		return Instant.fromEpochMillis(Date.now());
	}
}
