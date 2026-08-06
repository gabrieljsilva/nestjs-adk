import type { LlmModel } from "../model/llm-model";
import type { ModelFailure } from "../model/model-failure";
import { AgentFailoverPolicy } from "./agent-failover-policy";
import type { FailoverContext } from "./failover-context";

/**
 * Walks a declared queue of models in order, one per failure.
 * This is what the list form of `failover` becomes: the public literal is converted
 * here, so the runtime only ever deals with a policy.
 *
 * A refused request ends the walk. Every model in the queue is sent the same request,
 * so a provider that called it malformed is describing something the next attempt will
 * carry unchanged: continuing spends the whole chain to arrive at the first answer,
 * with the cause buried under a list of models that were never the problem. Whoever
 * wants the other bet, that a second provider accepts what the first refused, writes a
 * policy for it: `next` is handed the failure precisely so it can be decided on.
 */
export class SequentialFailoverPolicy extends AgentFailoverPolicy {
	private readonly queue: readonly LlmModel[];

	public constructor(queue: readonly LlmModel[]) {
		super();
		this.queue = [...queue];
	}

	public async next(failure: ModelFailure, context: FailoverContext): Promise<LlmModel | undefined> {
		if (failure.isInvalidRequest) return undefined;
		return this.queue[context.attempts - 1];
	}
}
