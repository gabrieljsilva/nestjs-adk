import { describe, expect, it } from "vitest";
import { SkillDefinition } from "./skill-definition";

describe("SkillDefinition", () => {
	it("carries the whole content, with no compact variant of itself", () => {
		const skill = SkillDefinition.always("refunds", "How refunds work", "the full policy");

		expect(skill.content).toBe("the full policy");
		expect(skill.isAlways).toBe(true);
	});

	it("keeps an always skill for the whole session, because it is never loaded", () => {
		expect(SkillDefinition.always("refunds", "d", "c").scope).toBe("session");
	});

	it("defaults an on-demand skill to the run that asked for it", () => {
		expect(SkillDefinition.onDemand("refunds", "d", "c").scope).toBe("run");
		expect(SkillDefinition.onDemand("refunds", "d", "c", "session").scope).toBe("session");
	});

	it("pins the exact content it carried", () => {
		expect(
			SkillDefinition.always("a", "d", "c")
				.digest()
				.equals(SkillDefinition.onDemand("b", "d", "c").digest()),
		).toBe(true);
	});
});
