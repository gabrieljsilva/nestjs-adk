import type { PromptContext } from "./prompt-context.value-object";
import type { PromptInstructions } from "./prompt-instructions.value-object";

/**
 * Builds an agent's prompt for one run. It is called once per agent per run, when the scope is
 * resolved, and never per turn: the prompt is the head of the prefix a provider caches.
 *
 * `undefined` is a real answer, and runs the agent with no instruction at all.
 */
export abstract class PromptBuilder {
	public abstract build(context: PromptContext): Promise<PromptInstructions | undefined>;
}
