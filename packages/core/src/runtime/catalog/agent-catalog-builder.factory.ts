import type { DeclaredAgent } from "../../domain/agent/declared-agent.value-object";
import { RuntimeToolRequest } from "../../domain/tool/runtime-tool-request.value-object";
import { RuntimeToolNames } from "../tool/runtime-tool-names.value-object";
import { AgentCatalog } from "./agent-catalog.service";
import { DuplicateAgentNameError } from "./errors/duplicate-agent-name.error";
import { DuplicateRuntimeToolNameError } from "./errors/duplicate-runtime-tool-name.error";

export class AgentCatalogBuilder {
	private readonly declared: DeclaredAgent[] = [];

	public add(agent: DeclaredAgent): this {
		const clash = this.declared.find((known) => known.definition.name.equals(agent.definition.name));
		if (clash !== undefined) {
			throw new DuplicateAgentNameError(agent.definition.name.value, clash.providerName, agent.providerName);
		}
		AgentCatalogBuilder.assertRuntimeNamesAreFree(agent);
		this.declared.push(agent);
		return this;
	}

	public build(): AgentCatalog {
		return new AgentCatalog([...this.declared]);
	}

	private static assertRuntimeNamesAreFree(agent: DeclaredAgent): void {
		for (const tool of agent.definition.tools) {
			if (tool instanceof RuntimeToolRequest || !RuntimeToolNames.owns(tool.name)) continue;
			throw new DuplicateRuntimeToolNameError(tool.name, agent.definition.name.value, agent.providerName);
		}
	}
}
