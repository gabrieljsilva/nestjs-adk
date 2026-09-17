import type { CompactionDecision } from "./compaction-decision.value-object";
import type { ContextBudget } from "./context-budget.value-object";

/**
 * Decides whether a context is too long and how much of it to keep.
 *
 * Extend it and register the subclass as a provider to decide compaction yourself. The
 * decision is taken from the measured budget alone, so a model that never declared a
 * context window is treated like any other.
 */
export abstract class AdkCompactionPolicy {
	public abstract decide(budget: ContextBudget): CompactionDecision;
}
