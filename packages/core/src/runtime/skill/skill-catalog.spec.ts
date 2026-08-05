import { describe, expect, it } from "vitest";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import { DuplicateSkillNameError } from "../../domain/skill/errors/duplicate-skill-name.error";
import { SkillDefinition } from "../../domain/skill/skill-definition";
import { SkillCatalog } from "./skill-catalog";

const refunds = SkillDefinition.always("refunds", "How refunds work", "refund policy");
const shipping = SkillDefinition.always("shipping", "How shipping works", "shipping policy");
const legal = SkillDefinition.onDemand("legal", "The full terms", "the very long terms");

describe("SkillCatalog", () => {
	it("puts every always skill into the instruction, after the agent prompt", () => {
		const catalog = SkillCatalog.of([refunds, shipping]);

		const instructions = catalog.instructions(PromptInstructions.from("Be brief."));

		expect(instructions?.text).toBe("Be brief.\n\nrefund policy\n\nshipping policy");
	});

	it("produces the same bytes for the same declaration, every time", () => {
		const first = SkillCatalog.of([refunds, shipping]).instructions(PromptInstructions.from("Be brief."));
		const second = SkillCatalog.of([refunds, shipping]).instructions(PromptInstructions.from("Be brief."));

		expect(first?.text).toBe(second?.text);
	});

	it("keeps an absent prompt absent when there is nothing to add", () => {
		expect(SkillCatalog.empty().instructions()).toBeUndefined();
	});

	it("leaves the content of an on-demand skill out of the prompt", () => {
		const instructions = SkillCatalog.of([legal]).instructions(PromptInstructions.from("Be brief."));

		expect(instructions?.text).toBe("Be brief.");
	});

	it("shows an on-demand skill only by name and description", () => {
		expect(SkillCatalog.of([refunds, legal]).describe()).toBe("legal: The full terms");
	});

	it("finds a skill that can be loaded, and never one that is already in the prompt", () => {
		const catalog = SkillCatalog.of([refunds, legal]);

		expect(catalog.find("legal")?.content).toBe("the very long terms");
		expect(catalog.find("refunds")).toBeUndefined();
	});

	it("says whether anything can be loaded at all", () => {
		expect(SkillCatalog.of([refunds]).hasOnDemand).toBe(false);
		expect(SkillCatalog.of([legal]).hasOnDemand).toBe(true);
	});

	it("refuses two skills under one name, instead of answering two ways about the same one", () => {
		expect(() => SkillCatalog.of([refunds, SkillDefinition.always("refunds", "again", "another body")])).toThrow(
			DuplicateSkillNameError,
		);
	});
});
