import { describe, expect, it } from "vitest";
import { DuplicateSkillNameError } from "./duplicate-skill-name.error";

describe("DuplicateSkillNameError", () => {
	it("names the skill that was declared twice", () => {
		const error = new DuplicateSkillNameError("refunds");

		expect(error.code).toBe("DUPLICATE_SKILL_NAME");
		expect(error.skillName).toBe("refunds");
		expect(error.message).toContain("refunds");
	});
});
