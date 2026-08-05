import { ModelResolver } from "../../contracts/model-resolver";
import type { AgentDefinition } from "../../domain/agent/agent-definition";
import type { LlmModel } from "../../domain/model/llm-model";

/** Default resolution: the model the agent declared, already resolved at boot. */
export class CatalogModelResolver extends ModelResolver {
	public resolve(definition: AgentDefinition): LlmModel {
		return definition.model;
	}
}
