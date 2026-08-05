import { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import { DuplicateSkillNameError } from "../../domain/skill/errors/duplicate-skill-name.error";
import type { SkillDefinition } from "../../domain/skill/skill-definition";

/**
 * The skills one agent has, split the two ways the prompt needs them.
 *
 * Always skills become part of the instruction, concatenated in the order they were
 * declared and never sorted: two runs of the same agent must produce the same bytes, and
 * any ordering that depends on anything but the declaration would not.
 *
 * A repeated name is refused rather than deduplicated. Silently keeping one of the two
 * would leave the instruction carrying both contents while a lookup found a single skill,
 * which is one catalog answering two ways.
 *
 * On-demand skills contribute only a name and a description, which is the catalog the
 * model chooses from. Their content stays out of the prompt until it is asked for.
 */
export class SkillCatalog {
	private readonly byName: ReadonlyMap<string, SkillDefinition>;

	private constructor(private readonly skills: readonly SkillDefinition[]) {
		this.byName = new Map(skills.map((skill) => [skill.name, skill]));
		Object.freeze(this);
	}

	public static of(skills: readonly SkillDefinition[]): SkillCatalog {
		const seen = new Set<string>();
		for (const skill of skills) {
			if (seen.has(skill.name)) throw new DuplicateSkillNameError(skill.name);
			seen.add(skill.name);
		}
		return new SkillCatalog([...skills]);
	}

	public static empty(): SkillCatalog {
		return new SkillCatalog([]);
	}

	public get onDemand(): readonly SkillDefinition[] {
		return this.skills.filter((skill) => !skill.isAlways);
	}

	public get hasOnDemand(): boolean {
		return this.onDemand.length > 0;
	}

	public find(name: string): SkillDefinition | undefined {
		const skill = this.byName.get(name);
		return skill?.isAlways === false ? skill : undefined;
	}

	/** The agent prompt with every always skill after it, in declaration order. */
	public instructions(base?: PromptInstructions): PromptInstructions | undefined {
		const always = this.skills.filter((skill) => skill.isAlways);
		if (always.length === 0) return base;
		return always.reduce(
			(carried, skill) => carried.concat(PromptInstructions.from(skill.content)),
			base ?? PromptInstructions.from(""),
		);
	}

	/** What the model is shown about the skills it can load, and nothing about their content. */
	public describe(): string {
		return this.onDemand.map((skill) => `${skill.name}: ${skill.description}`).join("\n");
	}
}
