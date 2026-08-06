import { type AgentDefinition, type LlmModel, ModelResolver } from "@nestjs-adk/core";

/**
 * The model each agent answers on, decided per agent instead of per application.
 *
 * This is the seam that makes a mixed run possible: a real provider on the agent under
 * test and a script on the ones it transfers to or delegates work to, or the other way
 * round. It sits in the runtime's own `ModelResolver` port, which every entry point
 * consults, so a transfer and a delegation route exactly like the first question does.
 *
 * An agent nobody routed keeps whatever the application resolved for it.
 */
export class RoutingModelResolver extends ModelResolver {
	private readonly byAgent = new Map<string, LlmModel>();

	/** Without a fallback an unrouted agent answers on the model its definition carries, as the catalog resolves it. */
	public constructor(private readonly fallback?: ModelResolver) {
		super();
	}

	/** Routes one agent, by the name `@Agent` declared. */
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
