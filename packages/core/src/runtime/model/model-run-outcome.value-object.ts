import type { ModelReroute } from "../../domain/agent/model-reroute.value-object";
import type { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import type { ModelResponse } from "../../domain/model/model-response.value-object";

export class ModelRunOutcome {
	public constructor(
		public readonly response: ModelResponse,
		public readonly reroutes: readonly ModelReroute[] = [],
	) {}

	public get servedBy(): ModelIdentity {
		return this.response.model;
	}

	public get wasRerouted(): boolean {
		return this.reroutes.length > 0;
	}
}
