import { AdkCompactionPolicy } from "./adk-compaction-policy";
import { CompactionDecision } from "./compaction-decision";
import type { ContextBudget } from "./context-budget";
import { InvalidCompactionThresholdError } from "./errors/invalid-compaction-threshold.error";

/**
 * Compacts once a measured call passes a declared ceiling, down to a declared target.
 *
 * It decides on the usage a provider reported, so a session that has never been called
 * is never compacted: there is no size to compare against a ceiling, and inventing one
 * is how a conversation gets shortened for no reason. This is what the literal form of
 * `compaction` becomes, so the runtime only ever deals with a policy.
 *
 * It compares against the projection rather than the measurement, because the decision it
 * takes is cheap and reversible while the alternative is not: compacting a turn early
 * costs some room, and compacting a turn late costs the call.
 */
export class TokenThresholdCompactionPolicy extends AdkCompactionPolicy {
	public constructor(
		public readonly maxTokens: number,
		public readonly targetTokens: number,
		public readonly keepRecentBlocks: number,
	) {
		super();
		if (targetTokens <= 0 || targetTokens >= maxTokens) {
			throw new InvalidCompactionThresholdError(maxTokens, targetTokens);
		}
	}

	public decide(budget: ContextBudget): CompactionDecision {
		const used = budget.projectedTokens;
		if (used === undefined || used <= this.maxTokens) return CompactionDecision.skip();
		return CompactionDecision.keepShare(this.targetTokens / used, this.keepRecentBlocks);
	}
}
