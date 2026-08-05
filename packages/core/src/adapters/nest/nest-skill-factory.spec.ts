import { describe, expect, it } from "vitest";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";
import { NestSkillFactory } from "./nest-skill-factory";

class SupportAgent {
	public tone(): string {
		return "Answer briefly.";
	}

	public policy(): string {
		return "Refunds within 7 days.";
	}

	public broken(): number {
		return 42;
	}
}

describe("NestSkillFactory", () => {
	it("reads the content once, by calling the method the decorator sits on", () => {
		const skill = new NestSkillFactory().fromMethod(
			new SupportAgent(),
			"tone",
			{ name: "tone", description: "Brand tone.", mode: "always" },
			"SupportAgent",
		);

		expect(skill.name).toBe("tone");
		expect(skill.content).toBe("Answer briefly.");
		expect(skill.isAlways).toBe(true);
	});

	it("defaults to on demand, so knowledge does not sit in every prompt by accident", () => {
		const skill = new NestSkillFactory().fromMethod(
			new SupportAgent(),
			"policy",
			{ name: "refund_policy", description: "The policy." },
			"SupportAgent",
		);

		expect(skill.isAlways).toBe(false);
	});

	it("refuses a skill whose method does not answer with text", () => {
		expect(() =>
			new NestSkillFactory().fromMethod(new SupportAgent(), "broken", { name: "b", description: "d" }, "SupportAgent"),
		).toThrow(InvalidAgentMetadataError);
	});

	it("refuses metadata missing a name or a description", () => {
		const factory = new NestSkillFactory();
		expect(() => factory.fromMethod(new SupportAgent(), "tone", { description: "d" }, "P")).toThrow(/name/);
		expect(() => factory.fromMethod(new SupportAgent(), "tone", { name: "n" }, "P")).toThrow(/description/);
	});
});
