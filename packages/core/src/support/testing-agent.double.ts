import { TestingModel } from "./testing-model.double";

export class TestingAgent<TAgent, TRequest = unknown> {
	public readonly model: TestingModel<TRequest>;

	public constructor(
		public readonly instance: TAgent,
		model: TestingModel<TRequest> = new TestingModel<TRequest>(),
	) {
		this.model = model;
	}
}
