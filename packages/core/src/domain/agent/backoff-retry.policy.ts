import { Duration } from "../../common/time/duration.value-object";
import { ModelRetryPolicy } from "./model-retry.policy";
import type { RetryAttempt } from "./retry-attempt.value-object";

/** Two retries, so a provider that is briefly busy costs three calls at most. */
const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_MILLIS = 500;
const DEFAULT_CEILING_MILLIS = 20_000;

/**
 * The shipped answer: wait what the provider asked for, and otherwise back off.
 *
 * Three rules, in the order they are asked.
 *
 * A failure that is not transient is never retried. A refused request, a safety block and
 * a context overflow are all the same request being rejected, so sending it again buys a
 * second bill and the same answer.
 *
 * A `Retry-After` the provider sent wins over any calculation, capped by the ceiling.
 * Guessing shorter than the provider asked is how a caller that was rate limited gets rate
 * limited harder, and the header is the only number in the exchange that is not a guess.
 *
 * Otherwise the delay doubles per attempt, with full jitter and a ceiling. The jitter is
 * not decoration: without it every caller that was throttled by the same provider at the
 * same moment comes back at the same moment, which is the burst that caused the throttle.
 */
export class BackoffRetryPolicy extends ModelRetryPolicy {
	public constructor(
		private readonly maxRetries: number = DEFAULT_RETRIES,
		private readonly base: Duration = Duration.fromMillis(DEFAULT_BASE_MILLIS),
		private readonly ceiling: Duration = Duration.fromMillis(DEFAULT_CEILING_MILLIS),
		/** Injected so a spec asserts the delay rather than a range. Answers in `[0, 1)`. */
		private readonly jitter: () => number = Math.random,
	) {
		super();
	}

	public findDelay(attempt: RetryAttempt): Duration | undefined {
		if (!attempt.failure.isTransient) return undefined;
		if (attempt.number > this.maxRetries) return undefined;
		const asked = attempt.failure.retryAfter;
		return (asked ?? this.backoff(attempt.number)).cappedAt(this.ceiling);
	}

	/** Full jitter: anything between nothing and the doubled window, never more than the ceiling. */
	private backoff(attempt: number): Duration {
		const window = this.base.millis * 2 ** (attempt - 1);
		return Duration.fromMillis(Math.round(window * this.jitter()));
	}
}
