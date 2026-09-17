import type { ModelFailure } from "../model/failures/model-failure.value-object";
import type { LlmModel } from "../model/llm-model.contract";
import { AgentFailoverPolicy } from "./agent-failover.policy";
import type { FailoverContext } from "./failover-context.value-object";

/**
 * Walks a declared queue of models in order, one per failure, which is what the list form of
 * `failover` becomes. A refused request ends the walk: every model in the queue is sent the same
 * request, so a provider that called it malformed describes something the next attempt carries
 * unchanged. A policy that wants the other bet is written by hand.
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
