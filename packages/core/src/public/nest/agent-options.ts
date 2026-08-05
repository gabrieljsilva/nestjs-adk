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
}
