import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import type { ModelFailure } from "../model/failures/model-failure.value-object";

/**
 * One failed attempt at a model, as the thing deciding whether to try it again reads it.
 *
 * `number` counts attempts already made against *this* model and resets when a failover
 * moves to the next one, because a fresh provider has not used up anything. That is the
 * difference from `FailoverContext`, which counts across the chain.
 */
export class RetryAttempt {
	public constructor(
		public readonly failure: ModelFailure,
		public readonly model: ModelIdentity,
		/** How many attempts this model has already had, starting at one for the first failure. */
		public readonly number: number,
	) {}
}
