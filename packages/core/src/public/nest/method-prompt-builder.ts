import { PromptBuilder } from "../../domain/prompt/prompt-builder";
import type { PromptContext } from "../../domain/prompt/prompt-context";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import { AdkAgent } from "./adk-agent";

/**
 * The bridge between an overridden `prompt()` and the runtime that calls it.
 *
 * It is the mirror of what a tool does: the instance is the one NestJS built, dependencies
 * included, and the method is invoked on it so `this` still reaches them. Nothing about a
 * decorator or a container crosses into the runtime, which only ever sees a `PromptBuilder`.
 *
 * A class that did not override the method gets no builder at all, which is how the common
 * case stays free: no call, no promise, and `@Agent({ prompt })` answers as it always did.
 */
export class MethodPromptBuilder extends PromptBuilder {
	private constructor(private readonly agent: AdkAgent) {
		super();
	}

	/**
	 * A builder for an instance that overrode `prompt()`, and nothing for anything else.
	 *
	 * The base method is the reference, so a subclass three levels down still counts and no
	 * decorator has to be declared to opt in. Comparing functions is what makes that work
	 * without walking prototypes: whatever answers `prompt` either is the base one or is not.
	 */
	public static forInstance(instance: unknown): MethodPromptBuilder | undefined {
		if (!(instance instanceof AdkAgent)) return undefined;
		const declared = Reflect.get(instance, "prompt");
		if (typeof declared !== "function") return undefined;
		return declared === Reflect.get(AdkAgent.prototype, "prompt") ? undefined : new MethodPromptBuilder(instance);
	}

	/** Whatever the agent answered, and nothing when it answered nothing worth sending. */
	public async build(context: PromptContext): Promise<PromptInstructions | undefined> {
		const method = Reflect.get(this.agent, "prompt");
		if (typeof method !== "function") return undefined;
		const text: unknown = await Reflect.apply(method, this.agent, [context]);
		if (typeof text !== "string") return undefined;
		const instructions = PromptInstructions.from(text);
		return instructions.isEmpty ? undefined : instructions;
	}
}
