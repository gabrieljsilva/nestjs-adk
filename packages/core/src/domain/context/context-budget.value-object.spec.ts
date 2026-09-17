import { describe, expect, it } from "vitest";
import { ModelContextWindow } from "../model/descriptor/model-context-window.value-object";
import { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import { UnknownContextWindow } from "../model/descriptor/unknown-context-window.value-object";
import { ModelUsage } from "../model/usage/model-usage.value-object";
import { PromptMeasurement } from "../model/usage/prompt-measurement.value-object";
import { ContextBudget } from "./context-budget.value-object";
import { ContextBudgetExceededError } from "./errors/context-budget-exceeded.error";

const MODEL = ModelIdentity.of("google", "gemini-flash");
const WINDOW = ModelContextWindow.of(1000, 200);

/** A call the provider counted: so many input tokens, over so much text. */
function measured(inputTokens: number, characters = 1000, outputTokens = 50): PromptMeasurement {
	const measurement = PromptMeasurement.from(ModelUsage.of(inputTokens, outputTokens), characters, MODEL);
	if (measurement === undefined) throw new Error("the fixture asked for a measurement of nothing");
	return measurement;
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
		const budget = new ContextBudget(WINDOW, undefined, 4000);

		expect(budget.isMeasured).toBe(false);
		expect(budget.usedTokens).toBeUndefined();
		expect(budget.projectedTokens).toBeUndefined();
		expect(budget.projectedFreeTokens).toBeUndefined();
		expect(budget.projectedFreeShare).toBeUndefined();
	});

	it("reports what a measured call used", () => {
		const budget = new ContextBudget(WINDOW, measured(300), 1000);

		expect(budget.isMeasured).toBe(true);
		expect(budget.usedTokens?.tokens).toBe(300);
	});

	it("reports how much of the window is still free", () => {
		const budget = new ContextBudget(WINDOW, measured(300), 1000);

		expect(budget.projectedFreeTokens).toBe(500);
		expect(budget.projectedFreeShare).toBeCloseTo(0.625, 5);
		expect(budget.projectedUsedShare).toBeCloseTo(0.375, 5);
	});

	it("counts only the input against the window, since the output is reserved apart", () => {
		const budget = new ContextBudget(WINDOW, measured(300, 1000, 900), 1000);

		expect(budget.projectedFreeTokens).toBe(500);
	});

	it("never reports negative free room", () => {
		const budget = new ContextBudget(WINDOW, measured(5000), 1000);

		expect(budget.projectedFreeTokens).toBe(0);
		expect(budget.isExhausted).toBe(true);
	});

	/** Nothing was added since the call, so the meter describes the call itself. */
	it("stands on the measured size when the caller names no current one", () => {
		const budget = new ContextBudget(WINDOW, measured(300, 2000));

		expect(budget.characters).toBe(2000);
		expect(budget.projectedTokens).toBe(300);
	});

	it("keeps the measurement itself unscaled, because nobody counted the prompt as it stands now", () => {
		const budget = new ContextBudget(WINDOW, measured(300, 1000), 2000);

		expect(budget.usedTokens?.tokens).toBe(300);
	});

	it("projects the measurement by how much the prompt grew since it was taken", () => {
		const budget = new ContextBudget(WINDOW, measured(300, 1000), 2000);

		expect(budget.projectedTokens).toBe(600);
		expect(budget.projectedFreeTokens).toBe(200);
	});

	it("projects downwards when the prompt shrank, which is what compaction does", () => {
		const budget = new ContextBudget(WINDOW, measured(300, 1000), 500);

		expect(budget.projectedTokens).toBe(150);
		expect(budget.projectedFreeTokens).toBe(650);
	});

	/** A measurement over no text cannot scale anything, so it is carried as it was counted. */
	it("does not scale a measurement taken over an empty prompt", () => {
		const budget = new ContextBudget(WINDOW, measured(300, 0), 4000);

		expect(budget.projectedTokens).toBe(300);
	});

	it("has no free room answer against an unknown window, even with a measured usage", () => {
		const budget = new ContextBudget(new UnknownContextWindow(), measured(300), 1000);

		expect(budget.isMeasured).toBe(true);
		expect(budget.isWindowKnown).toBe(false);
		expect(budget.isKnown).toBe(false);
		expect(budget.usedTokens?.tokens).toBe(300);
		expect(budget.projectedFreeTokens).toBeUndefined();
	});

	it("knows both halves only when the window is declared and a call was measured", () => {
		expect(new ContextBudget(WINDOW, measured(300), 1000).isKnown).toBe(true);
		expect(new ContextBudget(WINDOW, undefined, 1000).isKnown).toBe(false);
	});

	it("refuses a context whose projection is above a declared window", () => {
		const budget = new ContextBudget(WINDOW, measured(900), 1000);

		const failure = captureError(() => budget.verify(MODEL));

		expect(failure).toBeInstanceOf(ContextBudgetExceededError);
		if (!(failure instanceof ContextBudgetExceededError)) return;
		expect(failure.requestedTokens).toBe(900);
		expect(failure.availableTokens).toBe(800);
	});

	it("accepts a context whose projection fits", () => {
		const budget = new ContextBudget(WINDOW, measured(800), 1000);

		expect(budget.fits).toBe(true);
		expect(() => budget.verify(MODEL)).not.toThrow();
	});

	it("refuses nothing while no call has been measured, and lets the provider answer", () => {
		const budget = new ContextBudget(WINDOW, undefined, 1_000_000);

		expect(budget.fits).toBe(true);
		expect(() => budget.verify(MODEL)).not.toThrow();
	});

	it("refuses nothing against an unknown window", () => {
		const budget = new ContextBudget(new UnknownContextWindow(), measured(10_000_000), 1000);

		expect(() => budget.verify(MODEL)).not.toThrow();
	});

	/** The window is unbounded, so no share of it is ever passed and no policy triggers. */
	it("answers no used share against an unknown window", () => {
		const budget = new ContextBudget(new UnknownContextWindow(), measured(900), 1000);

		expect(budget.projectedUsedShare).toBe(0);
	});
});
