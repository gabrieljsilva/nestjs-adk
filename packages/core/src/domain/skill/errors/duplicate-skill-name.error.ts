import { AdkError } from "../../../common/errors/adk.error";

/**
 * Two skills of one agent were declared under the same name.
 *
 * Keeping both would mean two different answers to the same question: the instruction
 * would carry the content twice while a lookup by name found only one of them. Which one
 * a model got would depend on which side of the catalog asked.
 */
export class DuplicateSkillNameError extends AdkError {
	public readonly code = "DUPLICATE_SKILL_NAME";

	public constructor(public readonly skillName: string) {
		super(`Skill ${skillName} was declared more than once for the same agent.`);
	}
}
