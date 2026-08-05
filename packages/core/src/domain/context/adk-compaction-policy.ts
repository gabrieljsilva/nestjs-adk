import type { CompactionDecision } from "./compaction-decision";
import type { ContextBudget } from "./context-budget";

/**
 * When a context is too long, and how much of it should be left.
 *
 * Extend it and register the subclass as a provider to decide compaction yourself:
 *
 * ```ts
 * @Injectable()
 * export class NightlyCompaction extends AdkCompactionPolicy {
 *   public decide(budget: ContextBudget): CompactionDecision {
 *     return budget.inputTokens.tokens > 100_000 ? CompactionDecision.compactTo(60_000, 8) : CompactionDecision.skip();
 *   }
 * }
 * ```
 *
 * The decision is taken from the measured budget alone, so the same policy behaves the
 * same way against a model that never declared a context window.
 */
export abstract class AdkCompactionPolicy {
	public abstract decide(budget: ContextBudget): CompactionDecision;
}
