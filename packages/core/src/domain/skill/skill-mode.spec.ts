import { describe, expect, it } from "vitest";
import { SkillMode } from "./skill-mode";

describe("SkillMode", () => {
	it("tells a skill that is always present from one that is loaded", () => {
		expect(SkillMode.ALWAYS.isAlways).toBe(true);
		expect(SkillMode.ON_DEMAND.isAlways).toBe(false);
	});

	it("resolves the word a declaration carried", () => {
		expect(SkillMode.of("on-demand")).toBe(SkillMode.ON_DEMAND);
		expect(SkillMode.of("sometimes")).toBeUndefined();
	});

	it("reads as the word the author wrote", () => {
		expect(`${SkillMode.ALWAYS}`).toBe("always");
	});
});
