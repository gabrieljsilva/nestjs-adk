import { describe, expect, it } from "vitest";
import { ContextCategory } from "./context-category";

describe("ContextCategory", () => {
	it("names every slice the runtime measures", () => {
		expect(ContextCategory.all().map((category) => category.key)).toEqual([
			"runtime-instructions",
			"agent-prompt",
			"tool-descriptions",
			"active-skills",
			"summaries",
			"conversation",
			"tool-results",
			"media",
		]);
	});

	it("has no duplicated key", () => {
		const keys = ContextCategory.all().map((category) => category.key);

		expect(new Set(keys).size).toBe(keys.length);
	});

	it("compares by key", () => {
		expect(ContextCategory.CONVERSATION.equals(ContextCategory.CONVERSATION)).toBe(true);
		expect(ContextCategory.CONVERSATION.equals(ContextCategory.SUMMARIES)).toBe(false);
	});

	it("prints its key", () => {
		expect(String(ContextCategory.TOOL_RESULTS)).toBe("tool-results");
	});
});
