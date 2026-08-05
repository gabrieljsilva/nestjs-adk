import { ModelFailure } from "./model-failure";

/**
 * A failure the adapter could not classify.
 * It is deliberately not transient: an unrecognized error is treated as permanent so
 * a wrong guess never turns into an endless retry.
 */
export class UnknownFailure extends ModelFailure {
	public readonly kind = "unknown";
}
