import { ModelResolver } from "../../contracts/model/model-resolver.contract";
import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import type { LlmModel } from "../../domain/model/llm-model.contract";

export class CatalogModelResolver extends ModelResolver {
	public resolve(definition: AgentDefinition): LlmModel {
		return definition.model;
	}
}
