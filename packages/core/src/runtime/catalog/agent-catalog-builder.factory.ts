import type { DeclaredAgent } from "../../domain/agent/declared-agent.value-object";
import { AgentCatalog } from "./agent-catalog.service";
import { DuplicateAgentNameError } from "./errors/duplicate-agent-name.error";

export class AgentCatalogBuilder {
	private readonly declared: DeclaredAgent[] = [];

	public add(agent: DeclaredAgent): this {
		const clash = this.declared.find((known) => known.definition.name.equals(agent.definition.name));
		if (clash !== undefined) {
			throw new DuplicateAgentNameError(agent.definition.name.value, clash.providerName, agent.providerName);
		}
		this.declared.push(agent);
		return this;
	}

	public build(): AgentCatalog {
		return new AgentCatalog([...this.declared]);
	}
}
