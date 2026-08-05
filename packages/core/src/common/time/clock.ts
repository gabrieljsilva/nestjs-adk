import type { Instant } from "./instant";

/**
 * Source of the current time for the whole runtime.
 * Nothing reads the system clock directly, which is what makes runs reproducible in tests.
 */
export abstract class Clock {
	public abstract now(): Instant;
}
