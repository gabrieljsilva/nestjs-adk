import { ModelFailure } from "./model-failure";

/** The provider refused because the caller is over its quota or rate. */
export class RateLimitedFailure extends ModelFailure {
	public readonly kind = "rate-limited";

	public override get isRateLimited(): boolean {
		return true;
	}

	public override get isTransient(): boolean {
		return true;
	}
}
