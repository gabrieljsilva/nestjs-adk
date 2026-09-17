import { AdkError } from "../../../common/errors/adk.error";

/** Two skills of one agent were declared under the same name. */
export class DuplicateSkillNameError extends AdkError {
	public readonly code = "DUPLICATE_SKILL_NAME";

	public constructor(public readonly skillName: string) {
		super(`Skill ${skillName} was declared more than once for the same agent.`);
	}
}
