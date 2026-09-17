import { PromptInstructions } from "../../domain/prompt/prompt-instructions.value-object";
import { DuplicateSkillNameError } from "../../domain/skill/errors/duplicate-skill-name.error";
import type { SkillDefinition } from "../../domain/skill/skill-definition.value-object";

export class SkillCatalog {
	private readonly skills: readonly SkillDefinition[];
	private readonly byName: ReadonlyMap<string, SkillDefinition>;

	public constructor(declared: readonly SkillDefinition[]) {
		const seen = new Set<string>();
		for (const skill of declared) {
			if (seen.has(skill.name)) throw new DuplicateSkillNameError(skill.name);
			seen.add(skill.name);
		}
		this.skills = [...declared];
		this.byName = new Map(this.skills.map((skill) => [skill.name, skill]));
		Object.freeze(this);
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

	public instructions(base?: PromptInstructions): PromptInstructions | undefined {
		const always = this.skills.filter((skill) => skill.isAlways);
		if (always.length === 0) return base;
		return always.reduce(
			(carried, skill) => carried.concat(PromptInstructions.from(skill.content)),
			base ?? PromptInstructions.from(""),
		);
	}

	public describe(): string {
		return this.onDemand.map((skill) => `${skill.name}: ${skill.description}`).join("\n");
	}
}
