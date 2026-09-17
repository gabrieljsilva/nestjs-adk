export class ContextCategory {
	public static readonly RUNTIME_INSTRUCTIONS = new ContextCategory("runtime-instructions");
	public static readonly AGENT_PROMPT = new ContextCategory("agent-prompt");
	public static readonly TOOL_DESCRIPTIONS = new ContextCategory("tool-descriptions");
	public static readonly CONVERSATION = new ContextCategory("conversation");
	public static readonly TOOL_RESULTS = new ContextCategory("tool-results");
	public static readonly ACTIVE_SKILLS = new ContextCategory("active-skills");
	public static readonly SUMMARIES = new ContextCategory("summaries");
	public static readonly MEDIA = new ContextCategory("media");

	private constructor(public readonly key: string) {}

	public static fromKey(key: string): ContextCategory | undefined {
		return ContextCategory.all().find((category) => category.key === key);
	}

	public static all(): readonly ContextCategory[] {
		return [
			ContextCategory.RUNTIME_INSTRUCTIONS,
			ContextCategory.AGENT_PROMPT,
			ContextCategory.TOOL_DESCRIPTIONS,
			ContextCategory.ACTIVE_SKILLS,
			ContextCategory.SUMMARIES,
			ContextCategory.CONVERSATION,
			ContextCategory.TOOL_RESULTS,
			ContextCategory.MEDIA,
		];
	}

	public equals(other: ContextCategory): boolean {
		return this.key === other.key;
	}

	public toString(): string {
		return this.key;
	}
}
