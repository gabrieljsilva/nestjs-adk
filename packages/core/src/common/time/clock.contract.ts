import type { Duration } from "./duration.value-object";
import type { Instant } from "./instant.value-object";

/**
 * Source of the current time for the whole runtime.
 * Nothing reads the system clock directly, which is what makes runs reproducible in tests.
 */
export abstract class Clock {
	public abstract now(): Instant;

	/**
	 * Waits, and is the only way anything in the runtime waits.
	 *
	 * It is a method here rather than a timer at the call site because a test that has to
	 * outlast a real backoff is a test that either takes seconds or lies about what it
	 * proved. `FakeClock` answers immediately and moves itself forward instead, so a spec
	 * asserts the delay that was asked for rather than the time that passed.
	 *
	 * The default is a real timer, so a clock written outside this package keeps working by
	 * overriding `now` alone. An aborted signal ends the wait at once, and never rejects: a
	 * caller that cancels checks its own signal, and a sleep that threw would turn a
	 * cancellation into a second, different failure on the way out.
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
