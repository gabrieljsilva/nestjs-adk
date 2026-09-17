import { Duration } from "../../common/time/duration.value-object";
import { ModelRetryPolicy } from "./model-retry.policy";
import type { RetryAttempt } from "./retry-attempt.value-object";

const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_MILLIS = 500;
const DEFAULT_CEILING_MILLIS = 20_000;

/**
 * The shipped retry policy. A failure that is not transient is never retried; a `Retry-After` the
 * provider sent wins over any calculation; otherwise the delay doubles per attempt with full
 * jitter. Every delay is capped by the ceiling.
 */
export class BackoffRetryPolicy extends ModelRetryPolicy {
	public constructor(
		private readonly maxRetries: number = DEFAULT_RETRIES,
		private readonly base: Duration = Duration.fromMillis(DEFAULT_BASE_MILLIS),
		private readonly ceiling: Duration = Duration.fromMillis(DEFAULT_CEILING_MILLIS),
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

	private backoff(attempt: number): Duration {
		const window = this.base.millis * 2 ** (attempt - 1);
		return Duration.fromMillis(Math.round(window * this.jitter()));
	}
}
