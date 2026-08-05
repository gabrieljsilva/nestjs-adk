import type { LlmModel } from "../model/llm-model";
import type { ModelFailure } from "../model/model-failure";
import { AgentFailoverPolicy } from "./agent-failover-policy";
import type { FailoverContext } from "./failover-context";

/**
 * Walks a declared queue of models in order, one per failure.
 * This is what the list form of `failover` becomes: the public literal is converted
 * here, so the runtime only ever deals with a policy.
 */
export class SequentialFailoverPolicy extends AgentFailoverPolicy {
	private readonly queue: readonly LlmModel[];

	public constructor(queue: readonly LlmModel[]) {
		super();
		this.queue = [...queue];
	}

	public async next(_failure: ModelFailure, context: FailoverContext): Promise<LlmModel | undefined> {
		return this.queue[context.attempts - 1];
	}
}
