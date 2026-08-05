import { describe, expect, it } from "vitest";
import { ModelUsage } from "../model/model-usage";
import { ContextCategory } from "./context-category";
import { ContextComposition } from "./context-composition";

const composition = ContextComposition.of([
	[ContextCategory.CONVERSATION, 620],
	[ContextCategory.TOOL_RESULTS, 210],
	[ContextCategory.TOOL_DESCRIPTIONS, 120],
	[ContextCategory.AGENT_PROMPT, 50],
]);

describe("ContextComposition", () => {
	it("totals the characters of every category", () => {
		expect(composition.characters).toBe(1000);
	});

	it("reports each category as a share of the whole", () => {
		expect(composition.shareOf(ContextCategory.CONVERSATION)).toBe(0.62);
		expect(composition.shareOf(ContextCategory.TOOL_RESULTS)).toBe(0.21);
	});

	it("reports shares that add up to one", () => {
		const total = composition.entries.reduce((sum, entry) => sum + entry.share, 0);

		expect(total).toBeCloseTo(1, 10);
	});

	it("answers zero for a category nobody measured", () => {
		expect(composition.shareOf(ContextCategory.MEDIA)).toBe(0);
		expect(composition.charactersOf(ContextCategory.MEDIA)).toBe(0);
	});

	it("is empty when nothing was measured, without dividing by zero", () => {
		const empty = ContextComposition.of([[ContextCategory.CONVERSATION, 0]]);

		expect(empty.isEmpty).toBe(true);
		expect(empty.shareOf(ContextCategory.CONVERSATION)).toBe(0);
	});

	it("attributes a measured usage across the categories by share", () => {
		const attributed = composition.attribute(ModelUsage.of(1000, 200));

		expect(attributed.get(ContextCategory.CONVERSATION)?.tokens).toBe(620);
		expect(attributed.get(ContextCategory.TOOL_RESULTS)?.tokens).toBe(210);
	});

	it("attributes only the input, since the output is not part of the prompt", () => {
		const attributed = composition.attribute(ModelUsage.of(100, 900));
		const total = [...attributed.values()].reduce((sum, count) => sum + count.tokens, 0);

		expect(total).toBeLessThanOrEqual(100);
	});

	it("attributes nothing when the provider reported nothing", () => {
		const attributed = composition.attribute(ModelUsage.none());

		expect(attributed.get(ContextCategory.CONVERSATION)?.tokens).toBe(0);
	});

	it("reports how much it grew since an earlier size", () => {
		expect(composition.growthFrom(500)).toBe(2);
		expect(composition.growthFrom(1000)).toBe(1);
	});

	it("reports unbounded growth from nothing, rather than dividing by zero", () => {
		expect(composition.growthFrom(0)).toBe(Number.POSITIVE_INFINITY);
	});

	it("truncates fractional sizes and refuses negatives", () => {
		const odd = ContextComposition.of([
			[ContextCategory.CONVERSATION, 10.9],
			[ContextCategory.MEDIA, -5],
		]);

		expect(odd.charactersOf(ContextCategory.CONVERSATION)).toBe(10);
		expect(odd.charactersOf(ContextCategory.MEDIA)).toBe(0);
	});
});
