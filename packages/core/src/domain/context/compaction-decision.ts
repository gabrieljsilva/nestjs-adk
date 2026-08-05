/**
 * What a policy decided about one context.
 *
 * The target is a share of the current prompt to keep, not a number of tokens. The
 * policy is where tokens are spoken, because that is where a measured usage exists;
 * by the time a strategy is removing blocks, the only honest instrument left is
 * proportion, and asking it to hit a token count would mean estimating one.
 */
export class CompactionDecision {
	private constructor(
		public readonly shouldCompact: boolean,
		public readonly targetShare: number,
		public readonly keepRecentBlocks: number,
	) {}

	public static skip(): CompactionDecision {
		return new CompactionDecision(false, 1, 0);
	}

	/** `targetShare` is clamped into (0, 1]: keeping none, or more than everything, is not a compaction. */
	public static keepShare(targetShare: number, keepRecentBlocks: number): CompactionDecision {
		const share = Math.min(1, Math.max(0, targetShare));
		return new CompactionDecision(true, share, Math.max(0, Math.trunc(keepRecentBlocks)));
	}

	/** The size this decision is aiming at, given what the prompt measures now. */
	public targetOf(characters: number): number {
		return Math.floor(Math.max(0, characters) * this.targetShare);
	}
}
