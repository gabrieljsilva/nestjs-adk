import type { ModelReroute } from "../../domain/agent/model-reroute";
import type { ModelIdentity } from "../../domain/model/model-identity";
import type { ModelResponse } from "../../domain/model/model-response";

/**
 * The answer, and what it took to get it.
 *
 * The reroutes are returned rather than persisted here: writing to a journal is the
 * run's job, and a component that both calls models and appends events would be two
 * things. They arrive in the order they happened, so the run appends them the same way.
 */
export class ModelRunOutcome {
	public constructor(
		public readonly response: ModelResponse,
		public readonly reroutes: readonly ModelReroute[] = [],
	) {}

	/** The model that actually answered, which is also the one the cost belongs to. */
	public get servedBy(): ModelIdentity {
		return this.response.model;
	}

	public get wasRerouted(): boolean {
		return this.reroutes.length > 0;
	}
}
