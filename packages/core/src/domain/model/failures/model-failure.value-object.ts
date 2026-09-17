import type { Duration } from "../../../common/time/duration.value-object";

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

	/**
	 * How long the provider asked to be left alone, when it said so.
	 *
	 * It is declared here rather than only on the rate limited failure because a 503 with a
	 * `Retry-After` is the same instruction, and a retry policy that had to ask which class
	 * it was holding would be doing the `instanceof` this taxonomy exists to avoid. Absent
	 * means the provider said nothing, which is the usual case and not a zero.
	 */
	public get retryAfter(): Duration | undefined {
		return undefined;
	}

	/**
	 * True when the provider rejected the request rather than the work it asked for.
	 *
	 * It is asked instead of `instanceof` for the same reason `isRateLimited` is: an
	 * adapter ships as its own package, and two copies of this one in a tree would make
	 * the identity check answer no to a failure that plainly is one.
	 */
	public get isInvalidRequest(): boolean {
		return false;
	}
}
