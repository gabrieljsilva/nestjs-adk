import { TestingModel } from "./testing-model";

/**
 * Handle over the real agent instance, holding the model that scripts it.
 *
 * This block ships the skeleton: the handle pairs an agent with its `TestingModel`.
 * Resolution through the Nest testing module, the verbs, `requests`, `events`,
 * `session`, `cost` and `subAgent` arrive once the runtime exists.
 */
export class TestingAgent<TAgent, TRequest = unknown> {
	public readonly model: TestingModel<TRequest>;

	public constructor(
		public readonly instance: TAgent,
		model: TestingModel<TRequest> = new TestingModel<TRequest>(),
	) {
		this.model = model;
	}
}
