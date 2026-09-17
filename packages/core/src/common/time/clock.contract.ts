import type { Duration } from "./duration.value-object";
import type { Instant } from "./instant.value-object";

/** Source of the current time. Nothing in the runtime reads the system clock directly. */
export abstract class Clock {
	public abstract now(): Instant;

	/**
	 * Waits, and is the only way anything in the runtime waits. An aborted signal ends the
	 * wait at once and never rejects, so a cancellation never arrives as a second failure.
	 */
	public async sleep(duration: Duration, signal?: AbortSignal): Promise<void> {
		if (duration.isZero || signal?.aborted === true) return;
		await new Promise<void>((resolve) => {
			const done = (): void => {
				clearTimeout(timer);
				signal?.removeEventListener("abort", done);
				resolve();
			};
			const timer = setTimeout(done, duration.millis);
			signal?.addEventListener("abort", done, { once: true });
		});
	}
}
