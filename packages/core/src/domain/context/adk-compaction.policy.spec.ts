import { describe, expect, it } from "vitest";
import { ModelContextWindow } from "../model/descriptor/model-context-window.value-object";
import { ModelUsage } from "../model/usage/model-usage.value-object";
import { PromptMeasurement } from "../model/usage/prompt-measurement.value-object";
import { AdkCompactionPolicy } from "./adk-compaction.policy";
import { CompactionDecision } from "./compaction-decision.value-object";
import { ContextBudget } from "./context-budget.value-object";

class AlwaysCompacts extends AdkCompactionPolicy {
	public decide(_budget: ContextBudget): CompactionDecision {
		return CompactionDecision.keepShare(0.5, 2);
	}
}

describe("AdkCompactionPolicy", () => {
	it("is extended to decide compaction, and answers with a decision", () => {
		const measurement = PromptMeasurement.from(ModelUsage.of(500, 20), 1000);
		const budget = new ContextBudget(ModelContextWindow.of(1000, 100), measurement, 1000);

		const decision = new AlwaysCompacts().decide(budget);

		expect(decision.shouldCompact).toBe(true);
		expect(decision.targetShare).toBe(0.5);
	});

	it("is the type the runtime depends on", () => {
		expect(new AlwaysCompacts()).toBeInstanceOf(AdkCompactionPolicy);
	});
});
