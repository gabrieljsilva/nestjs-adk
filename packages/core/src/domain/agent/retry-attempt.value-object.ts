import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import type { ModelFailure } from "../model/failures/model-failure.value-object";

/**
 * One failed attempt at a model, as a retry policy reads it. `number` counts attempts against this
 * model alone, starting at one, and restarts when failover moves to the next model.
 */
export class RetryAttempt {
	public constructor(
		public readonly failure: ModelFailure,
		public readonly model: ModelIdentity,
		public readonly number: number,
	) {}
}
