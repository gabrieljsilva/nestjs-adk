import { AdkCompactionPolicy } from "./adk-compaction.policy";
import { CompactionDecision } from "./compaction-decision.value-object";
import type { ContextBudget } from "./context-budget.value-object";
import { InvalidCompactionThresholdError } from "./errors/invalid-compaction-threshold.error";

/** Compact once nine tenths of the window is spoken for, down to seven tenths of it. */
const DEFAULT_MAX_SHARE = 0.9;
const DEFAULT_TARGET_SHARE = 0.7;
/** Enough recent blocks that a compaction never lands in the middle of what is being discussed. */
const DEFAULT_KEEP_RECENT_BLOCKS = 4;

/** Where a conversation is compacted, and how much of the window is left standing. */
export interface WindowShareCompactionOptions {
	/** The share of the window that, once passed, triggers compaction. */
	maxShare?: number;
	/** The share of the window the compacted prompt aims at, necessarily below the ceiling. */
	targetShare?: number;
	/** How many of the most recent blocks survive regardless of age. */
	keepRecentBlocks?: number;
}

/**
 * Compacts once the projection passes a share of the model's window, down to a smaller share.
 *
 * It reasons in fractions rather than counts because the number that matters is relative:
 * two hundred thousand tokens is comfortable in a window of a million and impossible in one
 * of a hundred and twenty eight thousand. A share is the same instruction under both, which
 * is what lets one policy be the default for every model.
 *
 * A model that never declared a window has no share to exceed, so nothing is compacted and
 * the runtime reports the unknown window once instead of guessing a size. An application
 * that wants a conversation shortened anyway states the size itself, by extending
 * `AdkCompactionPolicy` with the number it has in mind.
 *
 * It decides on the usage a provider reported, so a session that has never been called is
 * never compacted: there is no size to compare against a ceiling, and inventing one is how
 * a conversation gets shortened for no reason. It compares against the projection rather
 * than the measurement, because the decision it takes is cheap and reversible while the
 * alternative is not: compacting a turn early costs some room, and compacting a turn late
 * costs the call.
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
