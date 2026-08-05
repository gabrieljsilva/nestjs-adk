import { describe, expect, it } from "vitest";
import { ContextCategory } from "./context-category";
import { ContextCompositionEntry } from "./context-composition-entry";

describe("ContextCompositionEntry", () => {
	it("ties a category to its size in characters and its share", () => {
		const entry = new ContextCompositionEntry(ContextCategory.CONVERSATION, 620, 0.62);

		expect(entry.category).toBe(ContextCategory.CONVERSATION);
		expect(entry.characters).toBe(620);
		expect(entry.share).toBe(0.62);
	});

	it("reports the share as a percentage for anything a person reads", () => {
		expect(new ContextCompositionEntry(ContextCategory.CONVERSATION, 620, 0.6234).percentage).toBe(62.3);
	});

	it("names the size after what it measures, which is characters and not tokens", () => {
		const entry = new ContextCompositionEntry(ContextCategory.CONVERSATION, 620, 0.62);

		expect(Reflect.get(entry, "tokens")).toBeUndefined();
	});
});
