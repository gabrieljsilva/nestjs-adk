import type { DeclaredAgent } from "../../domain/agent/declared-agent";
import { AgentCatalog } from "./agent-catalog";
import { DuplicateAgentNameError } from "./errors/duplicate-agent-name.error";

/**
 * Collects declared agents and publishes a frozen catalog.
 * Validation happens before publication, so an application with a duplicate name
 * fails at boot rather than on the first command that happens to hit it.
 */
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
		return AgentCatalog.of([...this.declared]);
	}
}
