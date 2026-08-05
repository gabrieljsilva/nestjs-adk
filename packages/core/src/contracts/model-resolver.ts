import type { AgentDefinition } from "../domain/agent/agent-definition";
import type { LlmModel } from "../domain/model/llm-model";

/**
 * Decides which model answers for an agent.
 *
 * It is a port so a test can replace it through `overrideProvider`, which removes
 * the need for a test only hook inside the registry. Production resolves from the
 * catalog; a test resolves to whatever double it wants.
 */
export abstract class ModelResolver {
	public abstract resolve(definition: AgentDefinition): LlmModel;
}
