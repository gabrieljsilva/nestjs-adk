/**
 * Why a model call failed, in terms a policy can decide on.
 *
 * The adapter of each provider translates its own error into one of these, so the
 * runtime never inspects a status code or matches a message. A failure it cannot
 * recognize stays `unknown` instead of being guessed into a retryable kind, because
 * guessing wrong turns a permanent error into an infinite reroute.
 */
export abstract class ModelFailure {
	public abstract readonly kind: string;

	public constructor(
		public readonly message: string,
		public readonly cause?: unknown,
	) {}

	public get isRateLimited(): boolean {
		return false;
	}

	/** True when trying the same model again could plausibly succeed. */
	public get isTransient(): boolean {
		return false;
	}
}
