import { describe, expect, it } from "vitest";
import type { ContextWindow } from "../model/descriptor/context-window.value-object";
import { ModelContextWindow } from "../model/descriptor/model-context-window.value-object";
import { UnknownContextWindow } from "../model/descriptor/unknown-context-window.value-object";
import { ModelUsage } from "../model/usage/model-usage.value-object";
import { PromptMeasurement } from "../model/usage/prompt-measurement.value-object";
import { ContextBudget } from "./context-budget.value-object";
import { InvalidCompactionThresholdError } from "./errors/invalid-compaction-threshold.error";
import { WindowShareCompactionPolicy } from "./window-share-compaction.policy";

/** A thousand tokens of input room, so a share reads as tenths of it. */
const WINDOW = new ModelContextWindow(1200, 200);

function buildBudget(inputTokens?: number, window: ContextWindow = WINDOW): ContextBudget {
	if (inputTokens === undefined) return new ContextBudget(window, undefined, 4000);
	return new ContextBudget(window, PromptMeasurement.from(ModelUsage.fromReport(inputTokens, 20), 1000), 1000);
}

describe("WindowShareCompactionPolicy", () => {
	it("leaves a conversation alone while it is below the ceiling", () => {
		expect(new WindowShareCompactionPolicy().decide(buildBudget(800)).shouldCompact).toBe(false);
	});

	it("compacts once the projection passes the ceiling", () => {
		const decision = new WindowShareCompactionPolicy().decide(buildBudget(950));

		expect(decision.shouldCompact).toBe(true);
		expect(decision.keepRecentBlocks).toBe(4);
	});

	/** Seven tenths of the window out of the nine and a half tenths in use is what has to survive. */
	it("keeps the share that lands the prompt on the target", () => {
		const decision = new WindowShareCompactionPolicy().decide(buildBudget(950));

		expect(decision.targetShare).toBeCloseTo(0.7 / 0.95, 5);
		expect(decision.calculateTarget(1000)).toBe(736);
	});

	it("compacts nothing in a session no provider has measured", () => {
		expect(new WindowShareCompactionPolicy().decide(buildBudget()).shouldCompact).toBe(false);
	});

	/**
	 * A window nobody declared has no share to exceed. Compacting against it would mean the
	 * runtime choosing a size for somebody's conversation, which is the one thing it will not do.
	 */
	it("compacts nothing against a window the model never declared", () => {
		const budget = buildBudget(10_000_000, new UnknownContextWindow());

		expect(new WindowShareCompactionPolicy().decide(budget).shouldCompact).toBe(false);
	});

	it("decides on the projection, so a prompt that grew since the call counts as it stands now", () => {
		const grown = new ContextBudget(WINDOW, PromptMeasurement.from(ModelUsage.fromReport(500, 20), 1000), 2000);

		expect(new WindowShareCompactionPolicy().decide(grown).shouldCompact).toBe(true);
	});

	it("takes the shares it was given over the standard ones", () => {
		const eager = new WindowShareCompactionPolicy({ maxShare: 0.5, targetShare: 0.2, keepRecentBlocks: 1 });

		const decision = eager.decide(buildBudget(600));

		expect(decision.shouldCompact).toBe(true);
		expect(decision.keepRecentBlocks).toBe(1);
	});

	it("refuses a target at or above the ceiling that triggers it", () => {
		expect(() => new WindowShareCompactionPolicy({ maxShare: 0.7, targetShare: 0.7 })).toThrow(
			InvalidCompactionThresholdError,
		);
		expect(() => new WindowShareCompactionPolicy({ maxShare: 0.7, targetShare: 0.8 })).toThrow(
			InvalidCompactionThresholdError,
		);
	});

	it("refuses shares outside the window they are shares of", () => {
		expect(() => new WindowShareCompactionPolicy({ maxShare: 1.5 })).toThrow(InvalidCompactionThresholdError);
		expect(() => new WindowShareCompactionPolicy({ maxShare: 0 })).toThrow(InvalidCompactionThresholdError);
		expect(() => new WindowShareCompactionPolicy({ targetShare: 0 })).toThrow(InvalidCompactionThresholdError);
	});

	it("compacts at nine tenths down to seven by default, which is what declaring nothing gets", () => {
		const policy = new WindowShareCompactionPolicy();

		expect(policy.maxShare).toBe(0.9);
		expect(policy.targetShare).toBe(0.7);
	});
});
