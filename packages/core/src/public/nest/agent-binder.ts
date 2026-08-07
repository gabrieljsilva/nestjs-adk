import { AGENT_METADATA } from "../../adapters/nest/metadata-keys";
import type { ScannedProvider } from "../../adapters/nest/scanned-provider";
import { AdkAgent } from "./adk-agent";
import type { AgentPrompting } from "./agent-prompting";
import type { AgentRegistry } from "./agent-registry";

/**
 * Hands each `AdkAgent` the handle for the agent it declared.
 *
 * It exists so an application can inject its own agent class and ask it something, instead
 * of injecting a registry and looking the name up. Nothing is created here: the instances
 * are the ones NestJS built, and the handles are the registry's own, so an agent reached
 * by class and the same agent reached by name are the same conversation.
 *
 * A class that does not extend `AdkAgent` is skipped rather than refused. Extending is one
 * way to use an agent and the registry is the other, and an application that picked the
 * second one is not missing anything.
 */
export class AgentBinder {
	public constructor(
		private readonly registry: AgentRegistry,
		/**
		 * Shared by every agent, which is what makes the file cache worth having: two agents
		 * reading the same template read it once.
		 */
		private readonly prompting?: AgentPrompting,
	) {}

	/** Answers how many were bound, which is what a caller can assert on. */
	public bind(providers: readonly ScannedProvider[]): number {
		let bound = 0;
		for (const provider of providers) {
			const name = this.nameOf(provider);
			if (name === undefined || !(provider.instance instanceof AdkAgent)) continue;
			provider.instance.bindTo(this.registry.get(name), this.prompting);
			bound += 1;
		}
		return bound;
	}

	private nameOf(provider: ScannedProvider): string | undefined {
		const metadata: unknown = Reflect.getMetadata(AGENT_METADATA, provider.type);
		if (typeof metadata !== "object" || metadata === null) return undefined;
		const name = Reflect.get(metadata, "name");
		return typeof name === "string" && name.length > 0 ? name : undefined;
	}
}
