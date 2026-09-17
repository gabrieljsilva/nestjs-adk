/**
 * Where one measured slice of the context came from.
 *
 * The set is closed and named because a budget that reports a single number tells
 * nobody which part of the prompt grew. Reserved output is not here: it is held back
 * by the window, not produced by the projection.
 */
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

	/** The one instance a stored key denotes, since `equals` and every lookup compare on it. */
	public static of(key: string): ContextCategory | undefined {
		return ContextCategory.all().find((category) => category.key === key);
	}

	/** In prompt order: what the model reads first comes first. */
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
