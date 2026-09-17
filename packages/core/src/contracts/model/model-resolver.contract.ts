import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import type { LlmModel } from "../../domain/model/llm-model.contract";

/** Decides which model answers for an agent. */
export abstract class ModelResolver {
	public abstract resolve(definition: AgentDefinition): LlmModel;
}
