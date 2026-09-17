import { type AgentDefinition, type LlmModel, ModelResolver } from "@nestjs-adk/core";

/**
 * Routes each agent to the model the test chose for it, through the same resolver production
 * uses, so a real provider can decide while scripts answer. Every transfer, delegation and
 * resumed approval resolves again.
 */
export class RoutingModelResolver extends ModelResolver {
	private readonly byAgent = new Map<string, LlmModel>();

	public constructor(private readonly fallback?: ModelResolver) {
		super();
	}

	public route(agent: string, model: LlmModel): this {
		this.byAgent.set(agent, model);
		return this;
	}

	public has(agent: string): boolean {
		return this.byAgent.has(agent);
	}

	public get routed(): readonly string[] {
		return [...this.byAgent.keys()];
	}

	public resolve(definition: AgentDefinition): LlmModel {
		const routed = this.byAgent.get(definition.name.value);
		if (routed !== undefined) return routed;
		return this.fallback === undefined ? definition.model : this.fallback.resolve(definition);
	}
}
