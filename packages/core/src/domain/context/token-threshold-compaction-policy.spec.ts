import { describe, expect, it } from "vitest";
import { ModelContextWindow } from "../model/model-context-window";
import { ModelUsage } from "../model/model-usage";
import { UnknownContextWindow } from "../model/unknown-context-window";
import { AdkCompactionPolicy } from "./adk-compaction-policy";
import { ContextBudget } from "./context-budget";
import { ContextCategory } from "./context-category";
import { ContextComposition } from "./context-composition";
import { InvalidCompactionThresholdError } from "./errors/invalid-compaction-threshold.error";
import { TokenThresholdCompactionPolicy } from "./token-threshold-compaction-policy";

const composition = ContextComposition.of([[ContextCategory.CONVERSATION, 1000]]);

function budgetOf(usedTokens?: number, known = true): ContextBudget {
	const window = known ? ModelContextWindow.of(1_000_000, 1000) : new UnknownContextWindow();
	if (usedTokens === undefined) return new ContextBudget(window, composition);
	return new ContextBudget(window, composition, ModelUsage.of(usedTokens, 0));
}

describe("TokenThresholdCompactionPolicy", () => {
	it("skips while the measured input is at the ceiling", () => {
		expect(new TokenThresholdCompactionPolicy(1000, 600, 4).decide(budgetOf(1000)).shouldCompact).toBe(false);
	});

	it("compacts once the ceiling is passed, aiming at the target as a share", () => {
		const decision = new TokenThresholdCompactionPolicy(1000, 600, 4).decide(budgetOf(1200));

		expect(decision.shouldCompact).toBe(true);
		expect(decision.targetShare).toBeCloseTo(0.5, 5);
		expect(decision.keepRecentBlocks).toBe(4);
	});

	it("skips when no call has been measured, since there is no size to compare", () => {
		expect(new TokenThresholdCompactionPolicy(1000, 600, 4).decide(budgetOf()).shouldCompact).toBe(false);
	});

	it("decides the same way against an unknown window, since the ceiling is its own", () => {
		expect(new TokenThresholdCompactionPolicy(1000, 600, 4).decide(budgetOf(1200, false)).shouldCompact).toBe(true);
	});

	it("refuses a target above the ceiling that triggers it", () => {
		expect(() => new TokenThresholdCompactionPolicy(1000, 1000, 4)).toThrow(InvalidCompactionThresholdError);
		expect(() => new TokenThresholdCompactionPolicy(1000, 1200, 4)).toThrow(InvalidCompactionThresholdError);
	});

	it("refuses a target of zero, which would compact everything away", () => {
		expect(() => new TokenThresholdCompactionPolicy(1000, 0, 4)).toThrow(InvalidCompactionThresholdError);
	});

	it("is a compaction policy", () => {
		expect(new TokenThresholdCompactionPolicy(1000, 600, 4)).toBeInstanceOf(AdkCompactionPolicy);
	});
});
