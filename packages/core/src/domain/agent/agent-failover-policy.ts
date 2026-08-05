import type { LlmModel } from "../model/llm-model";
import type { ModelFailure } from "../model/model-failure";
import type { FailoverContext } from "./failover-context";

/**
 * Which model replaces the primary one after a failure.
 *
 * Returning nothing ends the attempts. The runtime keeps attempts and failures inside
 * the run, applies this policy and emits an observable event on every switch, so the
 * model never learns that a chain exists.
 */
export abstract class AgentFailoverPolicy {
	public abstract next(failure: ModelFailure, context: FailoverContext): Promise<LlmModel | undefined>;
}
