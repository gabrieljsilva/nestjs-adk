import type { Duration } from "../../../common/time/duration.value-object";

/**
 * Why a model call failed, in terms a retry or failover policy can decide on.
 * Each provider's adapter translates its own error into one of these, and an error it
 * cannot recognize stays `unknown` rather than being guessed into a retryable kind.
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

	public get isTransient(): boolean {
		return false;
	}

	public get retryAfter(): Duration | undefined {
		return undefined;
	}

	public get isInvalidRequest(): boolean {
		return false;
	}
}
