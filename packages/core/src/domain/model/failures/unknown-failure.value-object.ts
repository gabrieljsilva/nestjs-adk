import { ModelFailure } from "./model-failure.value-object";

/**
 * A failure the adapter could not classify.
 * Never transient: an unrecognized error is treated as permanent so a wrong guess never
 * turns into an endless retry.
 */
export class UnknownFailure extends ModelFailure {
	public readonly kind = "unknown";
}
