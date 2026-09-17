import { AdkCompactionPolicy } from "./adk-compaction.policy";
import { CompactionDecision } from "./compaction-decision.value-object";
import type { ContextBudget } from "./context-budget.value-object";
import { InvalidCompactionThresholdError } from "./errors/invalid-compaction-threshold.error";

// The shares Cline and Cursor compact at.
const DEFAULT_MAX_SHARE = 0.9;
const DEFAULT_TARGET_SHARE = 0.7;
const DEFAULT_KEEP_RECENT_BLOCKS = 4;

/** Where a conversation is compacted, and how much of the window is left standing. */
export interface WindowShareCompactionOptions {
	maxShare?: number;
	targetShare?: number;
	keepRecentBlocks?: number;
}

/**
 * Compacts once the projection passes a share of the model's window, down to a smaller share.
 * The default policy, and the one an application gets when it declares none.
 *
 * Nothing is compacted for a model that declared no window, or for a session no provider
 * has measured yet. Throws `InvalidCompactionThresholdError` when the shares disagree.
 */
export class WindowShareCompactionPolicy extends AdkCompactionPolicy {
	public readonly maxShare: number;
	public readonly targetShare: number;
	public readonly keepRecentBlocks: number;

	public constructor(options: WindowShareCompactionOptions = {}) {
		super();
		this.maxShare = options.maxShare ?? DEFAULT_MAX_SHARE;
		this.targetShare = options.targetShare ?? DEFAULT_TARGET_SHARE;
		this.keepRecentBlocks = options.keepRecentBlocks ?? DEFAULT_KEEP_RECENT_BLOCKS;
		if (this.maxShare <= 0 || this.maxShare > 1) {
			throw new InvalidCompactionThresholdError(this.maxShare, this.targetShare);
		}
		if (this.targetShare <= 0 || this.targetShare >= this.maxShare) {
			throw new InvalidCompactionThresholdError(this.maxShare, this.targetShare);
		}
	}

	public decide(budget: ContextBudget): CompactionDecision {
		const used = budget.projectedUsedShare;
		if (used === undefined || used <= this.maxShare) return CompactionDecision.skip();
		return CompactionDecision.keepShare(this.targetShare / used, this.keepRecentBlocks);
	}
}
