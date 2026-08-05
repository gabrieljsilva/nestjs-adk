import { describe, expect, it } from "vitest";
import { ModelContextWindow } from "../model/model-context-window";
import { ModelIdentity } from "../model/model-identity";
import { ModelUsage } from "../model/model-usage";
import { UnknownContextWindow } from "../model/unknown-context-window";
import { ContextBudget } from "./context-budget";
import { ContextCategory } from "./context-category";
import { ContextComposition } from "./context-composition";
import { ContextBudgetExceededError } from "./errors/context-budget-exceeded.error";

const MODEL = ModelIdentity.of("google", "gemini-flash");
const WINDOW = ModelContextWindow.of(1000, 200);

function compositionOf(characters: number): ContextComposition {
	return ContextComposition.of([[ContextCategory.CONVERSATION, characters]]);
}

function captureError(work: () => void): unknown {
	try {
		work();
		return undefined;
	} catch (error) {
		return error;
	}
}

describe("ContextBudget", () => {
	it("has no size before a provider reported one", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(4000));

		expect(budget.isMeasured).toBe(false);
		expect(budget.usedTokens).toBeUndefined();
		expect(budget.projectedTokens).toBeUndefined();
		expect(budget.projectedFreeTokens).toBeUndefined();
		expect(budget.projectedFreeShare).toBeUndefined();
	});

	it("reports what a measured call used", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(1000), ModelUsage.of(300, 50));

		expect(budget.isMeasured).toBe(true);
		expect(budget.usedTokens?.tokens).toBe(300);
	});

	it("reports how much of the window is still free", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(1000), ModelUsage.of(300, 50));

		expect(budget.projectedFreeTokens).toBe(500);
		expect(budget.projectedFreeShare).toBeCloseTo(0.625, 5);
		expect(budget.projectedUsedShare).toBeCloseTo(0.375, 5);
	});

	it("counts only the input against the window, since the output is reserved apart", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(1000), ModelUsage.of(300, 900));

		expect(budget.projectedFreeTokens).toBe(500);
	});

	it("never reports negative free room", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(1000), ModelUsage.of(5000, 0));

		expect(budget.projectedFreeTokens).toBe(0);
		expect(budget.isExhausted).toBe(true);
	});

	it("keeps the measurement itself unscaled, because nobody counted the prompt as it stands now", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(2000), ModelUsage.of(300, 50), 1000);

		expect(budget.usedTokens?.tokens).toBe(300);
	});

	it("projects the measurement by how much the prompt grew since it was taken", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(2000), ModelUsage.of(300, 50), 1000);

		expect(budget.projectedTokens).toBe(600);
		expect(budget.projectedFreeTokens).toBe(200);
	});

	it("projects downwards when the prompt shrank, which is what compaction does", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(500), ModelUsage.of(300, 50), 1000);

		expect(budget.projectedTokens).toBe(150);
		expect(budget.projectedFreeTokens).toBe(650);
	});

	it("has no free room answer against an unknown window, even with a measured usage", () => {
		const budget = new ContextBudget(new UnknownContextWindow(), compositionOf(1000), ModelUsage.of(300, 50));

		expect(budget.isMeasured).toBe(true);
		expect(budget.isWindowKnown).toBe(false);
		expect(budget.isKnown).toBe(false);
		expect(budget.usedTokens?.tokens).toBe(300);
		expect(budget.projectedFreeTokens).toBeUndefined();
	});

	it("knows both halves only when the window is declared and a call was measured", () => {
		expect(new ContextBudget(WINDOW, compositionOf(1000), ModelUsage.of(300, 50)).isKnown).toBe(true);
		expect(new ContextBudget(WINDOW, compositionOf(1000)).isKnown).toBe(false);
	});

	it("refuses a context whose projection is above a declared window", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(1000), ModelUsage.of(900, 0));

		const failure = captureError(() => budget.verify(MODEL));

		expect(failure).toBeInstanceOf(ContextBudgetExceededError);
		if (!(failure instanceof ContextBudgetExceededError)) return;
		expect(failure.requestedTokens).toBe(900);
		expect(failure.availableTokens).toBe(800);
	});

	it("accepts a context whose projection fits", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(1000), ModelUsage.of(800, 0));

		expect(budget.fits).toBe(true);
		expect(() => budget.verify(MODEL)).not.toThrow();
	});

	it("refuses nothing while no call has been measured, and lets the provider answer", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(1_000_000));

		expect(budget.fits).toBe(true);
		expect(() => budget.verify(MODEL)).not.toThrow();
	});

	it("refuses nothing against an unknown window", () => {
		const budget = new ContextBudget(new UnknownContextWindow(), compositionOf(1000), ModelUsage.of(10_000_000, 0));

		expect(() => budget.verify(MODEL)).not.toThrow();
	});

	it("keeps the composition, which is what says where the room went", () => {
		const budget = new ContextBudget(WINDOW, compositionOf(1000), ModelUsage.of(300, 50));

		expect(budget.composition.shareOf(ContextCategory.CONVERSATION)).toBe(1);
	});
});
