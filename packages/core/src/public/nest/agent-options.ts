import type { AgentFailoverPolicy } from "../../domain/agent/agent-failover-policy";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction-policy";
import type { LlmModel } from "../../domain/model/llm-model";

/**
 * What `@Agent` declares.
 *
 * The name and the description are the two things a runtime cannot invent: the name is how
 * anything reaches this agent, and the description is what another agent reads when
 * deciding whether to hand it work. Everything else has an answer without the developer.
 *
 * `tools` lists classes, because that is what a NestJS application has at hand when it
 * writes the decorator. Turning them into definitions happens after the container is
 * built, where the instances exist.
 */
export interface AgentOptions {
	name: string;
	description: string;
	/** The prompt this agent runs under, verbatim. */
	prompt?: string;
	/** Classes decorated with `@Tool`, each already a provider of its own. */
	tools?: readonly unknown[];
	/** Answers for this agent alone; without one it answers on the module's default. */
	model?: LlmModel;
	/**
	 * Where a failed model call goes next.
	 *
	 * A list of models is walked in order, one per failure, and a refused request ends the
	 * walk instead of spending the chain on a request every model receives unchanged. A
	 * policy decides for itself. Without either, the first failure ends the run.
	 */
	failover?: readonly LlmModel[] | AgentFailoverPolicy;
	/**
	 * When this agent's context is too long, and how much of it survives.
	 *
	 * Declared here it replaces the module's policy rather than narrowing it, because two
	 * policies deciding how much to keep would be one shortening what the other held on to.
	 * Without one, and without a module policy, nothing is ever compacted.
	 */
	compaction?: AdkCompactionPolicy;
}
