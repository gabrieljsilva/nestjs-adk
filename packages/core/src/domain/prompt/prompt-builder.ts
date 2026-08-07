import type { PromptContext } from "./prompt-context";
import type { PromptInstructions } from "./prompt-instructions";

/**
 * What builds an agent's prompt for one run.
 *
 * The runtime holds this and not the agent class: a definition is domain, and calling a
 * method on something NestJS built is the adapter's business. It is the same seam a tool
 * crosses through `ToolHandler`, for the same reason.
 *
 * It is called once per agent per run, at the moment the scope is resolved, and never per
 * turn. That is a cost decision as much as a design one: the prompt is the head of the
 * prefix a provider caches, so a prompt that changes between turns of one run invalidates
 * every cached token after it.
 *
 * `undefined` is a real answer. An agent whose prompt turned out to be empty runs with no
 * instruction at all, which is the same composition as an agent that declared none.
 */
export abstract class PromptBuilder {
	public abstract build(context: PromptContext): Promise<PromptInstructions | undefined>;
}
