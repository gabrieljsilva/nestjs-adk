import type { ModelFailure } from "../model/failures/model-failure.value-object";
import type { LlmModel } from "../model/llm-model.contract";
import type { FailoverContext } from "./failover-context.value-object";

/** Which model replaces the primary one after a failure. Returning nothing ends the attempts. */
export abstract class AgentFailoverPolicy {
	public abstract next(failure: ModelFailure, context: FailoverContext): Promise<LlmModel | undefined>;
}
