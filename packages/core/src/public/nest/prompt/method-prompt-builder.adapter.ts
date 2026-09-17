import { PromptBuilder } from "../../../domain/prompt/prompt-builder.contract";
import type { PromptContext } from "../../../domain/prompt/prompt-context.value-object";
import { PromptInstructions } from "../../../domain/prompt/prompt-instructions.value-object";
import { AdkAgent } from "../agent/adk-agent.edge";

export class MethodPromptBuilder extends PromptBuilder {
	private constructor(private readonly agent: AdkAgent) {
		super();
	}

	public static forInstance(instance: unknown): MethodPromptBuilder | undefined {
		if (!(instance instanceof AdkAgent)) return undefined;
		const declared = Reflect.get(instance, "prompt");
		if (typeof declared !== "function") return undefined;
		return declared === Reflect.get(AdkAgent.prototype, "prompt") ? undefined : new MethodPromptBuilder(instance);
	}

	public async build(context: PromptContext): Promise<PromptInstructions | undefined> {
		const method = Reflect.get(this.agent, "prompt");
		if (typeof method !== "function") return undefined;
		const text: unknown = await Reflect.apply(method, this.agent, [context]);
		if (typeof text !== "string") return undefined;
		const instructions = PromptInstructions.from(text);
		return instructions.isEmpty ? undefined : instructions;
	}
}
