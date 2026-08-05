import type { ModelFailure } from "../model/model-failure";
import type { ModelIdentity } from "../model/model-identity";

/**
 * One switch of model inside a single request.
 *
 * It is a fact of the run, recorded so the journal can carry it and an operator can see
 * that an answer came from the second choice. Cost does not move with it: the tokens the
 * failed attempt spent stay charged to the model that spent them.
 */
export class ModelReroute {
	public constructor(
		public readonly from: ModelIdentity,
		public readonly to: ModelIdentity,
		public readonly failure: ModelFailure,
		public readonly attempt: number,
	) {}
}
