import { describe, expect, it } from "vitest";
import { ModelContextWindow } from "../model/model-context-window";
import { ModelUsage } from "../model/model-usage";
import { AdkCompactionPolicy } from "./adk-compaction-policy";
import { CompactionDecision } from "./compaction-decision";
import { ContextBudget } from "./context-budget";
import { ContextCategory } from "./context-category";
import { ContextComposition } from "./context-composition";

class AlwaysCompacts extends AdkCompactionPolicy {
	public decide(_budget: ContextBudget): CompactionDecision {
		return CompactionDecision.keepShare(0.5, 2);
	}
}

describe("AdkCompactionPolicy", () => {
	it("is extended to decide compaction, and answers with a decision", () => {
		const composition = ContextComposition.of([[ContextCategory.CONVERSATION, 1000]]);
		const budget = new ContextBudget(ModelContextWindow.of(1000, 100), composition, ModelUsage.of(500, 20));

		const decision = new AlwaysCompacts().decide(budget);

		expect(decision.shouldCompact).toBe(true);
		expect(decision.targetShare).toBe(0.5);
	});

	it("is the type the runtime depends on", () => {
		expect(new AlwaysCompacts()).toBeInstanceOf(AdkCompactionPolicy);
	});
});
