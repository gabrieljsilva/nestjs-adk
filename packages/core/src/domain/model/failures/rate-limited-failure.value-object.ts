import type { Duration } from "../../../common/time/duration.value-object";
import { ModelFailure } from "./model-failure.value-object";

/** The provider refused because the caller is over its quota or rate. */
export class RateLimitedFailure extends ModelFailure {
	public readonly kind = "rate-limited";

	public constructor(
		message: string,
		cause?: unknown,
		/** What the provider's own `Retry-After` said, when it sent one. */
		private readonly askedFor?: Duration,
	) {
		super(message, cause);
	}

	public override get isRateLimited(): boolean {
		return true;
	}

	public override get isTransient(): boolean {
		return true;
	}

	public override get retryAfter(): Duration | undefined {
		return this.askedFor;
	}
}
