import { PromptFiles } from "../prompts/prompt-files";
import type { AgentDefinition, SkillBinding } from "../registry/agent-definition";
import type { ToolContext } from "../types/tool-context";

const promptFiles = new PromptFiles();

export interface InstructionOptions {
	promptsDir?: string;
}

/** Content of a skill (class via DI or inline method with the agent's `this`). */
export async function skillContent(definition: AgentDefinition, binding: SkillBinding): Promise<string> {
	if (binding.kind === "class") return binding.instance.content();
	const method = (definition.instance as Record<string, () => string | Promise<string>>)[binding.method];
	return (await method?.call(definition.instance)) ?? "";
}

/** Resolves the instruction source: AdkPrompt builder | literal text | verbatim .md file. */
async function resolvePrompt(
	definition: AgentDefinition,
	options: InstructionOptions,
	ctx?: ToolContext,
): Promise<string | undefined> {
	// The runner always provides ctx (createToolContext) — builders can rely on attributes/state.
	if (definition.promptInstance) return definition.promptInstance.build(ctx as ToolContext);
	if (definition.promptText !== undefined) return definition.promptText;
	// promptFile was normalized to absolute by @Agent when relative ("./") — verbatim, no vars.
	if (definition.promptFile) return promptFiles.render(definition.promptFile, { promptsDir: options.promptsDir });
	return undefined;
}

/**
 * Builds the final instruction, from stable to volatile, in deterministic order:
 * prompt → `always` skills (classes in array order, inlines in declaration order) → on-demand catalog.
 * Byte-for-byte identical across runs with the same inputs (stable prefix for implicit caching).
 */
export async function buildInstruction(
	definition: AgentDefinition,
	options: InstructionOptions = {},
	ctx?: ToolContext,
): Promise<string | undefined> {
	const sections: string[] = [];

	const prompt = await resolvePrompt(definition, options, ctx);
	if (prompt) sections.push(prompt);

	const catalog: string[] = [];

	for (const skill of definition.skills) {
		if (skill.options.mode === "always") {
			sections.push(`## Skill: ${skill.options.name}\n${await skillContent(definition, skill)}`);
		} else {
			catalog.push(`- ${skill.options.name}: ${skill.options.description}`);
		}
	}

	if (catalog.length > 0) {
		sections.push(
			`## Available skills\nLook up a skill's content with the load_skill(name) tool.\n${catalog.join("\n")}`,
		);
	}

	return sections.length > 0 ? sections.join("\n\n") : undefined;
}
