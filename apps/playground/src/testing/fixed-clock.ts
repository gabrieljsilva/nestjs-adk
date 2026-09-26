import { Clock, Instant } from "@nestjs-adk/core";

export class FixedClock extends Clock {
	public constructor(private readonly at: Instant) {
		super();
	}

	public static at(iso: string): FixedClock {
		return new FixedClock(Instant.fromIso(iso));
	}

	public now(): Instant {
		return this.at;
	}
}
