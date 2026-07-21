/**
 * Contract for a shared skill (class decorated with @Skill()).
 * Content is fetched on demand via load_skill, or injected into the instruction (mode: 'always').
 */
export abstract class AdkSkill {
	public abstract content(): string | Promise<string>;
}
